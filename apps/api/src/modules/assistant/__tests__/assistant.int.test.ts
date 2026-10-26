import request from 'supertest';
import PDFDocument from 'pdfkit';
import { Role } from '@prisma/client';
import { createApp } from '../../../app';
import { disconnectPrisma, prisma } from '../../../core/db';
import { createActiveBatch, createLoginUser } from '../../../../test/fixtures';
import { bearer, login } from '../../../../test/http';
import {
  mockEmbeddings,
  setProvidersForTests,
  type AssistantProvider,
  type AssistantRequest,
  type AssistantResult,
} from '../providers';

const app = createApp();
const pathOf = (url: string) => new URL(url).pathname;
const auth = async (email: string) => bearer((await login(app, email)).accessToken);

const WELDING = `Arc welding safety. Always wear a welding helmet with a shade 10 filter lens, leather
gloves and a flame resistant jacket. Keep the work area clear of paper, oil and other flammable
material. Check the earth clamp is firmly attached before striking the arc. Electrode holders must
be dry. Ventilate the booth so welding fumes are drawn away from the face.`;

/** A provider that records what it was sent and returns a fixed result. */
function fakeAssistant(result: Partial<AssistantResult> = {}) {
  const calls: AssistantRequest[] = [];
  const provider: AssistantProvider = {
    price: { inputPerMTok: 0.1, outputPerMTok: 0.5 },
    generate(req) {
      calls.push(req);
      return Promise.resolve({
        offTopic: false,
        answer: 'Wear a helmet with a shade 10 lens and leather gloves [1].',
        questions: null,
        usage: { inputTokens: 1000, outputTokens: 200 },
        ...result,
      });
    },
  };
  return { provider, calls };
}

function pdfOf(text: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument();
    const parts: Buffer[] = [];
    doc.on('data', (b: Buffer) => parts.push(b));
    doc.on('end', () => resolve(Buffer.concat(parts)));
    doc.text(text);
    doc.end();
  });
}

/** A batch with one student; the admin uploads a material for its course. */
async function world() {
  const db = prisma();
  const w = await createActiveBatch(db, { students: 1, sessions: 1 });
  const admin = await createLoginUser(db, Role.ADMIN);
  const A = await auth(admin.email);
  const student = w.students[0]!;
  const S = await auth(student.user.email);
  return { ...w, A, S, student };
}
type World = Awaited<ReturnType<typeof world>>;

async function addMaterial(w: World, body: Buffer, contentType: string, title = 'Welding safety') {
  const target = await request(app)
    .post('/api/v1/materials/upload-url')
    .set(w.A)
    .send({ courseId: w.course.id, fileName: 'm', contentType, sizeBytes: body.length })
    .expect(200);
  expect(target.body.key).toMatch(new RegExp(`^materials/${w.course.id}/`));
  await request(app)
    .put(pathOf(target.body.url))
    .set('Content-Type', contentType)
    .send(body)
    .expect(201);
  const created = await request(app)
    .post('/api/v1/materials')
    .set(w.A)
    .send({ courseId: w.course.id, title, key: target.body.key })
    .expect(201);
  expect(created.body.status).toBe('PENDING');
  return created.body.id as string;
}

async function approvedWorld() {
  const w = await world();
  const id = await addMaterial(w, Buffer.from(WELDING), 'text/plain');
  const approved = await request(app).post(`/api/v1/materials/${id}/approve`).set(w.A).expect(200);
  expect(approved.body).toMatchObject({ status: 'APPROVED', chunkCount: 1 });
  return { ...w, materialId: id };
}

const on = { enabled: true, monthlyCapUsd: 1_000_000 };

afterEach(() => setProvidersForTests({}));
afterAll(() => disconnectPrisma());

describe('materials (BRQ-17.2)', () => {
  it('extracts, chunks and embeds a PDF on approval; only admins manage materials', async () => {
    const seen: Buffer[] = [];
    setProvidersForTests({
      embeddings: mockEmbeddings,
      pdfText: (body) => {
        seen.push(body);
        return Promise.resolve(WELDING);
      },
    });
    const w = await world();
    await request(app).get('/api/v1/materials').set(w.S).expect(403);

    const id = await addMaterial(w, await pdfOf(WELDING), 'application/pdf', 'Safety PDF');
    const res = await request(app).post(`/api/v1/materials/${id}/approve`).set(w.A).expect(200);
    expect(res.body.status).toBe('APPROVED');
    expect(res.body.chunkCount).toBeGreaterThan(0);
    expect(seen[0]!.subarray(0, 5).toString()).toBe('%PDF-');
    const chunks = await prisma().$queryRaw<Array<{ content: string; dims: number }>>`
      SELECT content, vector_dims(embedding) AS dims FROM material_chunks WHERE material_id = ${id}::uuid`;
    expect(chunks[0]!.content).toContain('welding helmet');
    expect(chunks[0]!.dims).toBe(1024);

    await request(app).post(`/api/v1/materials/${id}/approve`).set(w.A).expect(409);
    const audit = await prisma().auditLog.findMany({ where: { entityId: id } });
    expect(audit.map((a) => a.action).sort()).toEqual(['MATERIAL_APPROVED', 'MATERIAL_UPLOADED']);
  });

  it('refuses an empty file and a key from another course', async () => {
    const w = await world();
    const id = await addMaterial(w, Buffer.from('   \n  '), 'text/plain');
    const res = await request(app).post(`/api/v1/materials/${id}/approve`).set(w.A).expect(422);
    expect(res.body.error.code).toBe('NO_TEXT');

    const other = await createActiveBatch(prisma(), { students: 1, sessions: 1 });
    const bad = await request(app)
      .post('/api/v1/materials')
      .set(w.A)
      .send({ courseId: other.course.id, title: 'Wrong', key: `materials/${w.course.id}/x.txt` })
      .expect(422);
    expect(bad.body.error.code).toBe('INVALID_KEY');
  });
});

describe('POST /assistant/ask (F17)', () => {
  it('is closed while the switch is off', async () => {
    setProvidersForTests({ ai: { enabled: false, monthlyCapUsd: 10 } });
    const w = await world();
    const res = await request(app)
      .post('/api/v1/assistant/ask')
      .set(w.S)
      .send({ question: 'What gloves do I wear?' })
      .expect(503);
    expect(res.body.error.code).toBe('AI_DISABLED');
  });

  it('stops at the daily limit and at the monthly cap, before any model call', async () => {
    const fake = fakeAssistant();
    const w = await approvedWorld();
    setProvidersForTests({ assistant: fake.provider, ai: { enabled: true, monthlyCapUsd: 0 } });
    const capped = await request(app)
      .post('/api/v1/assistant/ask')
      .set(w.S)
      .send({ question: 'What gloves do I wear?' })
      .expect(503);
    expect(capped.body.error.code).toBe('ASSISTANT_BUDGET_REACHED');

    setProvidersForTests({ assistant: fake.provider, ai: on });
    await prisma().assistantLog.createMany({
      data: Array.from({ length: 30 }, () => ({
        userId: w.student.user.id,
        mode: 'answer',
        question: 'earlier',
      })),
    });
    const limited = await request(app)
      .post('/api/v1/assistant/ask')
      .set(w.S)
      .send({ question: 'What gloves do I wear?' })
      .expect(429);
    expect(limited.body.error.code).toBe('ASSISTANT_DAILY_LIMIT');
    expect(fake.calls).toHaveLength(0);
  });

  it('declines without calling the model when nothing in the materials matches (BR-21)', async () => {
    const fake = fakeAssistant();
    const w = await approvedWorld();
    setProvidersForTests({ assistant: fake.provider, ai: on });
    const res = await request(app)
      .post('/api/v1/assistant/ask')
      .set(w.S)
      .send({ question: 'Who won yesterday’s cricket match?' })
      .expect(200);
    expect(res.body).toMatchObject({ refused: 'NOT_IN_MATERIALS', answer: null });
    expect(fake.calls).toHaveLength(0);
    const log = await prisma().assistantLog.findFirstOrThrow({
      where: { userId: w.student.user.id },
    });
    expect(log).toMatchObject({ refused: true, refusalReason: 'NOT_IN_MATERIALS' });
  });

  it('answers from the student’s own course with sources, and sends no personal data', async () => {
    const fake = fakeAssistant();
    const w = await approvedWorld();
    setProvidersForTests({ assistant: fake.provider, ai: on });
    const res = await request(app)
      .post('/api/v1/assistant/ask')
      .set(w.S)
      .send({ question: 'Which gloves and helmet filter lens should I wear for welding?' })
      .expect(200);
    expect(res.body.refused).toBeNull();
    expect(res.body.answer).toContain('[1]');
    expect(res.body.sources[0]).toMatchObject({ n: 1, materialId: w.materialId });
    expect(res.body.remainingToday).toBe(29);

    expect(fake.calls).toHaveLength(1);
    const sent = JSON.stringify(fake.calls[0]);
    const student = await prisma().student.findUniqueOrThrow({
      where: { id: w.student.studentId },
    });
    for (const pii of [w.student.user.fullName, w.student.user.email, student.rollNo]) {
      expect(sent).not.toContain(pii);
    }
    expect(fake.calls[0]!.language).toBe('English');

    const log = await prisma().assistantLog.findFirstOrThrow({
      where: { userId: w.student.user.id },
    });
    expect(log.chunkIds).toHaveLength(1);
    expect(log).toMatchObject({ refused: false, inputTokens: 1000, outputTokens: 200 });
    expect(Number(log.costUsd)).toBeCloseTo(0.0002, 6);

    // Another course's student cannot reach these materials.
    const other = await createActiveBatch(prisma(), { students: 1, sessions: 1 });
    const O = await auth(other.students[0]!.user.email);
    const none = await request(app)
      .post('/api/v1/assistant/ask')
      .set(O)
      .send({ question: 'Which gloves should I wear for welding?' })
      .expect(200);
    expect(none.body.refused).toBe('NO_COURSE');
  });

  it('keeps only well-formed practice questions', async () => {
    const q = (over: object) => ({
      question: 'Which shade of filter lens?',
      options: ['5', '10', '14', '2'],
      answer_index: 1,
      explanation: 'The material says shade 10 [1].',
      source: 1,
      ...over,
    });
    const fake = fakeAssistant({
      answer: null,
      questions: [q({}), q({ options: ['a', 'b', 'c'] }), q({ source: 7 }), q({ answer_index: 4 })],
    });
    const w = await approvedWorld();
    setProvidersForTests({ assistant: fake.provider, ai: on });
    const res = await request(app)
      .post('/api/v1/assistant/ask')
      .set(w.S)
      .send({
        question: 'Which gloves and helmet filter lens should I wear for welding?',
        mode: 'practice',
      })
      .expect(200);
    expect(res.body.questions).toEqual([
      {
        question: 'Which shade of filter lens?',
        options: ['5', '10', '14', '2'],
        answerIndex: 1,
        explanation: 'The material says shade 10 [1].',
        source: 1,
      },
    ]);
  });

  it('reports an off-topic reply as a refusal and shows usage to admins', async () => {
    const fake = fakeAssistant({ offTopic: true, answer: '' });
    const w = await approvedWorld();
    setProvidersForTests({ assistant: fake.provider, ai: on });
    const res = await request(app)
      .post('/api/v1/assistant/ask')
      .set(w.S)
      .send({
        question: 'Which gloves and helmet filter lens should I wear for welding at my wedding?',
      })
      .expect(200);
    expect(res.body.refused).toBe('OFF_TOPIC');

    const status = await request(app).get('/api/v1/assistant/status').set(w.S).expect(200);
    expect(status.body).toMatchObject({ enabled: true, dailyLimit: 30, remainingToday: 29 });
    expect(status.body.courses).toEqual([{ id: w.course.id, title: w.course.title, materials: 1 }]);

    await request(app).get('/api/v1/assistant/usage').set(w.S).expect(403);
    const usage = await request(app).get('/api/v1/assistant/usage').set(w.A).expect(200);
    expect(usage.body.questions).toBeGreaterThan(0);
    expect(usage.body.refusals.OFF_TOPIC).toBeGreaterThan(0);
  });
});
