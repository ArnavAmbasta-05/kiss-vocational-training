import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../../../app';
import { disconnectPrisma, prisma } from '../../../core/db';
import { createLoginUser, createTrainedBatch, uid } from '../../../../test/fixtures';
import { bearer, login } from '../../../../test/http';

const app = createApp();
afterAll(() => disconnectPrisma());
const auth = async (email: string) => bearer((await login(app, email)).accessToken);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * A student with two verified competencies (WIRE-x at 3, SAFE-x at 2) and a resource for a third
 * (EARTH-x), plus an admin. Codes carry a suffix so tests don't share them.
 */
async function world() {
  const db = prisma();
  const s = uid().toUpperCase();
  const code = (c: string) => `${c}${s}`;
  const w = await createTrainedBatch(db, [{ attended: 4, marks: 45 }]);
  const admin = await createLoginUser(db, Role.ADMIN);
  const A = await auth(admin.email);
  const T = await auth(w.trainer.email);
  const mk = async (c: string, title: string) =>
    (
      await request(app)
        .post(`/api/v1/courses/${w.course.id}/competencies`)
        .set(A)
        .send({ code: code(c), title, mode: 'PRACTICAL', requiredLevel: 2, isMandatory: false })
        .expect(201)
    ).body as { id: string };
  const wire = await mk('WIRE', 'Wire a circuit');
  const safe = await mk('SAFE', 'Work safely');
  const earth = await mk('EARTH', 'Earth an installation');
  const student = w.students[0]!;
  await request(app)
    .put(`/api/v1/batches/${w.batch.id}/competency-ratings`)
    .set(T)
    .send({
      ratings: [
        { studentId: student.studentId, competencyId: wire.id, level: 3, verify: true },
        { studentId: student.studentId, competencyId: safe.id, level: 2, verify: true },
      ],
    })
    .expect(200);
  // An approved resource for the missing skill (the gap analyzer recommends it).
  const resource = await request(app)
    .post('/api/v1/resources')
    .set(A)
    .send({
      competencyId: earth.id,
      title: `Earthing guide ${s}`,
      type: 'DOCUMENT',
      url: 'https://example.org/earth',
    });
  if (resource.status === 201 && !resource.body.approved) {
    await request(app).post(`/api/v1/resources/${resource.body.id}/approve`).set(A);
  }
  return { ...w, A, S: await auth(student.user.email), student, code, s };
}
type World = Awaited<ReturnType<typeof world>>;

async function role(w: World, title: string, reqs: Array<[string, number]>) {
  return (
    await request(app)
      .post('/api/v1/job-roles')
      .set(w.A)
      .send({
        title: `${title} ${w.s}`,
        competencies: reqs.map(([c, level]) => ({ code: w.code(c).toLowerCase(), level })),
      })
      .expect(201)
  ).body as { id: string; competencies: Array<{ code: string; title: string | null }> };
}

async function opportunity(w: World, roleId: string, title: string, closesOn = inDays(30)) {
  return (
    await request(app)
      .post('/api/v1/opportunities')
      .set(w.A)
      .send({
        roleId,
        title: `${title} ${w.s}`,
        type: 'APPRENTICESHIP',
        partner: 'Odisha Power Co',
        closesOn,
      })
      .expect(201)
  ).body as { id: string; isOpen: boolean };
}

describe('job roles and opportunities (BRQ-C.3, BRQ-13.1)', () => {
  it('admin defines a role by competency codes and publishes an opportunity', async () => {
    const w = await world();
    const r = await role(w, 'Electrician helper', [
      ['WIRE', 3],
      ['EARTH', 2],
    ]);
    // Codes are stored upper-case and titled from the competency model.
    expect(r.competencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: w.code('WIRE'), title: 'Wire a circuit' }),
        expect.objectContaining({ code: w.code('EARTH'), title: 'Earth an installation' }),
      ]),
    );
    const dup = await request(app)
      .post('/api/v1/job-roles')
      .set(w.A)
      .send({ title: `Electrician helper ${w.s}`, competencies: [{ code: 'X', level: 1 }] });
    expect(dup.status).toBe(409);

    const o = await opportunity(w, r.id, 'Apprentice electrician');
    expect(o.isOpen).toBe(true);
    const closed = await opportunity(w, r.id, 'Last year', inDays(-1));
    expect(closed.isOpen).toBe(false);

    // Students can't manage roles or opportunities.
    await request(app).get('/api/v1/job-roles').set(w.S).expect(403);
    await request(app)
      .post('/api/v1/opportunities')
      .set(w.S)
      .send({ roleId: r.id, title: 'x', type: 'JOB', partner: 'y', closesOn: inDays(5) })
      .expect(403);
  });
});

describe('matches (BR-22, BRQ-13.2, 13.3)', () => {
  it('ranks open opportunities by match % and lists missing skills with resources', async () => {
    const w = await world();
    const full = await role(w, 'Wireman', [
      ['WIRE', 3],
      ['SAFE', 2],
    ]);
    const third = await role(w, 'Installer', [
      ['WIRE', 4], // verified at 3: not enough
      ['SAFE', 2],
      ['EARTH', 2], // never verified
    ]);
    const a = await opportunity(w, full.id, 'Wireman job');
    const b = await opportunity(w, third.id, 'Installer internship');
    await opportunity(w, full.id, 'Closed one', inDays(-2));

    const res = await request(app).get('/api/v1/students/me/matches').set(w.S).expect(200);
    const mine = (res.body as Array<{ opportunity: { id: string } }>).filter((m) =>
      [a.id, b.id].includes(m.opportunity.id),
    );
    expect(mine.map((m) => m.opportunity.id)).toEqual([a.id, b.id]);
    const [first, second] = res.body.filter((m: { opportunity: { id: string } }) =>
      [a.id, b.id].includes(m.opportunity.id),
    );
    expect(first).toMatchObject({ matchPercent: 100, verified: 2, required: 2, missing: [] });
    expect(second).toMatchObject({ matchPercent: 33.33, verified: 1, required: 3 });
    expect(second.missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: w.code('WIRE'), requiredLevel: 4, verifiedLevel: 3 }),
        expect.objectContaining({
          code: w.code('EARTH'),
          title: 'Earth an installation',
          verifiedLevel: null,
        }),
      ]),
    );
    // Closed opportunities are not offered.
    expect(
      res.body.some((m: { opportunity: { title: string } }) =>
        m.opportunity.title.startsWith('Closed one'),
      ),
    ).toBe(false);
  });
});

describe('interest (BRQ-13.4)', () => {
  it('the student marks interest; the admin sees interested students with match %, and a CSV', async () => {
    const w = await world();
    const r = await role(w, 'Fitter', [
      ['WIRE', 3],
      ['EARTH', 2],
    ]);
    const o = await opportunity(w, r.id, 'Fitter job');
    await request(app).post(`/api/v1/opportunities/${o.id}/interest`).set(w.S).expect(200);
    // Idempotent: a second click doesn't duplicate.
    await request(app).post(`/api/v1/opportunities/${o.id}/interest`).set(w.S).expect(200);

    const list = await request(app)
      .get(`/api/v1/opportunities/${o.id}/interested`)
      .set(w.A)
      .expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({
        studentId: w.student.studentId,
        fullName: w.student.user.fullName,
        email: w.student.user.email,
        matchPercent: 50,
      }),
    ]);
    const csv = await request(app)
      .get(`/api/v1/opportunities/${o.id}/interested.csv`)
      .set(w.A)
      .expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain(w.student.user.email);

    const matches = await request(app).get('/api/v1/students/me/matches').set(w.S).expect(200);
    expect(
      matches.body.find((m: { opportunity: { id: string } }) => m.opportunity.id === o.id)
        .interested,
    ).toBe(true);

    await request(app).delete(`/api/v1/opportunities/${o.id}/interest`).set(w.S).expect(200);
    const after = await request(app)
      .get(`/api/v1/opportunities/${o.id}/interested`)
      .set(w.A)
      .expect(200);
    expect(after.body).toEqual([]);
  });

  it('refuses interest in a closed opportunity', async () => {
    const w = await world();
    const r = await role(w, 'Helper', [['SAFE', 1]]);
    const o = await opportunity(w, r.id, 'Old', inDays(-1));
    const res = await request(app).post(`/api/v1/opportunities/${o.id}/interest`).set(w.S);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OPPORTUNITY_CLOSED');
  });
});
