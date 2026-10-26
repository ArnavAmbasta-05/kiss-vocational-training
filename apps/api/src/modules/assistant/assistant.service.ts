import { randomUUID } from 'node:crypto';
import { Prisma, type Locale } from '@prisma/client';
import type {
  AskInput,
  AssistantRefusal,
  AssistantReply,
  AssistantSource,
  AssistantStatus,
  AssistantUsage,
  MaterialCreateInput,
  MaterialDto,
  MaterialUploadUrlInput,
  PracticeQuestion,
  UploadTarget,
} from '@vtmp/shared';
import { MATERIAL_MIME } from '@vtmp/shared';
import { withAudit, type Actor } from '../../core/audit';
import { prisma } from '../../core/db';
import { AppError } from '../../core/errors';
import { logger } from '../../core/logger';
import { settings } from '../../core/settings';
import { storage } from '../../core/storage';
import * as batches from '../batches/batches.service';
import * as competency from '../competency/competency.service';
import * as courses from '../courses/courses.service';
import * as users from '../users/users.service';
import {
  aiConfig,
  assistantProvider,
  embeddingProvider,
  pdfText,
  type AssistantRequest,
  type RawPracticeQuestion,
} from './providers';
import { chunkText, costUsd, estimateTokens, guard, relevantEnough } from './rules';

const EXTENSION: Record<(typeof MATERIAL_MIME)[number], string> = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
};

const LANGUAGE: Record<Locale, AssistantRequest['language']> = {
  en: 'English',
  or: 'Odia',
  hi: 'Hindi',
};

/** Characters of an excerpt shown on a source chip. */
const EXCERPT_PREVIEW = 280;
/** Approved resources listed under an answer (BRQ-17.4). */
const MAX_RESOURCES = 5;

const vectorLiteral = (v: number[]) => `[${v.join(',')}]`;

/** Start of today and of this month in the institution's time zone (IST by default), as UTC. */
async function periodStarts(now = new Date()) {
  const offsetMs = (await settings.get('institution.utcOffsetMinutes')) * 60_000;
  const local = new Date(now.getTime() + offsetMs);
  const day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const month = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1);
  return {
    today: new Date(day - offsetMs),
    month: new Date(month - offsetMs),
    monthLabel: `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`,
  };
}

async function usedToday(userId: string, since: Date): Promise<number> {
  return prisma().assistantLog.count({ where: { userId, createdAt: { gte: since } } });
}

async function monthCost(since: Date): Promise<number> {
  const agg = await prisma().assistantLog.aggregate({
    where: { createdAt: { gte: since } },
    _sum: { costUsd: true },
  });
  return Number(agg._sum.costUsd ?? 0);
}

/** Courses the student is (or was) placed in, newest batch first, without repeats. */
async function studentCourseIds(studentId: string): Promise<string[]> {
  const placements = await batches.placementsOf(studentId);
  const ids: string[] = [];
  for (const p of placements) {
    const b = await batches.courseOf(p.batch.id);
    if (b && !ids.includes(b.courseId)) ids.push(b.courseId);
  }
  return ids;
}

async function approvedCounts(courseIds: string[]): Promise<Map<string, number>> {
  if (courseIds.length === 0) return new Map();
  const rows = await prisma().material.groupBy({
    by: ['courseId'],
    where: { courseId: { in: courseIds }, status: 'APPROVED' },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.courseId, r._count._all]));
}

/** GET /assistant/status: whether the student can ask, about which courses, and how often. */
export async function status(userId: string, studentId: string): Promise<AssistantStatus> {
  const { enabled } = aiConfig();
  const [{ today }, dailyLimit, courseIds, titles] = await Promise.all([
    periodStarts(),
    settings.get('assistant.dailyLimitPerUser'),
    studentCourseIds(studentId),
    courseTitles(),
  ]);
  const [used, counts] = await Promise.all([usedToday(userId, today), approvedCounts(courseIds)]);
  return {
    enabled,
    courses: courseIds
      .filter((id) => (counts.get(id) ?? 0) > 0)
      .map((id) => ({ id, title: titles.get(id) ?? '', materials: counts.get(id) ?? 0 })),
    remainingToday: Math.max(0, dailyLimit - used),
    dailyLimit,
  };
}

interface Hit {
  id: string;
  materialId: string;
  title: string;
  content: string;
  similarity: number;
}

/** Top-K approved excerpts of these courses by cosine similarity (pgvector HNSW index). */
async function search(courseIds: string[], query: number[], k: number): Promise<Hit[]> {
  const vec = vectorLiteral(query);
  return prisma().$queryRaw<Hit[]>`
    SELECT c.id, c.material_id AS "materialId", m.title, c.content,
           1 - (c.embedding <=> ${vec}::vector) AS similarity
    FROM material_chunks c
    JOIN materials m ON m.id = c.material_id
    WHERE m.status = 'APPROVED' AND m.course_id = ANY(${courseIds}::uuid[])
    ORDER BY c.embedding <=> ${vec}::vector
    LIMIT ${k}`;
}

/** Practice questions must have four options, a valid answer and a source we sent (BRQ-17.3). */
function validQuestions(raw: RawPracticeQuestion[], sources: number): PracticeQuestion[] {
  return raw
    .filter(
      (q) =>
        q.question.trim() &&
        q.options.length === 4 &&
        q.options.every((o) => o.trim()) &&
        Number.isInteger(q.answer_index) &&
        q.answer_index >= 0 &&
        q.answer_index < 4 &&
        q.source >= 1 &&
        q.source <= sources,
    )
    .map((q) => ({
      question: q.question.trim(),
      options: q.options.map((o) => o.trim()),
      answerIndex: q.answer_index,
      explanation: q.explanation.trim(),
      source: q.source,
    }));
}

/** BRQ-17.4: approved resources for the student's open competency gaps (from F12). */
async function gapResources(studentId: string): Promise<AssistantReply['resources']> {
  const gaps = await competency.studentGaps(studentId);
  const seen = new Set<string>();
  const out: AssistantReply['resources'] = [];
  for (const item of [...gaps.belowLevel, ...gaps.notAssessed]) {
    for (const r of item.recommendations) {
      if (seen.has(r.id) || out.length >= MAX_RESOURCES) continue;
      seen.add(r.id);
      out.push({ id: r.id, title: r.title, type: r.type, url: r.url });
    }
  }
  return out;
}

/**
 * POST /assistant/ask (F17, BR-21, NFR-13). In order: switch, daily limit and monthly cap;
 * the student's own courses; retrieval; a polite refusal without any model call when nothing
 * is similar enough; otherwise the model, given only the excerpts, the question and the reply
 * language (never the student's name, roll number or contact details). Every request that
 * passes the guard is logged with its excerpts, tokens, cost, latency and outcome.
 */
export async function ask(
  user: { id: string; studentId: string; locale: Locale },
  input: AskInput,
): Promise<AssistantReply> {
  const started = Date.now();
  const ai = aiConfig();
  const [{ today, month }, dailyLimit, minSimilarity, topK] = await Promise.all([
    periodStarts(),
    settings.get('assistant.dailyLimitPerUser'),
    settings.get('assistant.minSimilarity'),
    settings.get('assistant.topK'),
  ]);
  const [used, spent] = await Promise.all([usedToday(user.id, today), monthCost(month)]);
  const blocked = guard({
    enabled: ai.enabled,
    usedToday: used,
    dailyLimit,
    monthCostUsd: spent,
    monthlyCapUsd: ai.monthlyCapUsd,
  });
  if (blocked === 'DISABLED') {
    throw new AppError(503, 'AI_DISABLED', 'The training assistant is not switched on');
  }
  if (blocked === 'DAILY_LIMIT') {
    throw new AppError(
      429,
      'ASSISTANT_DAILY_LIMIT',
      `You can ask ${dailyLimit} questions a day. Try again tomorrow.`,
    );
  }
  if (blocked === 'BUDGET_REACHED') {
    throw new AppError(
      503,
      'ASSISTANT_BUDGET_REACHED',
      'The assistant has reached its limit for this month',
    );
  }
  const remainingToday = Math.max(0, dailyLimit - used - 1);

  const record = async (entry: {
    chunkIds?: string[];
    best?: number | null;
    refused?: AssistantRefusal | null;
    usage?: { inputTokens: number; outputTokens: number };
    cost?: number;
  }) => {
    await prisma().assistantLog.create({
      data: {
        userId: user.id,
        mode: input.mode,
        question: input.question,
        chunkIds: entry.chunkIds ?? [],
        bestSimilarity: entry.best ?? null,
        refused: !!entry.refused,
        refusalReason: entry.refused ?? null,
        inputTokens: entry.usage?.inputTokens ?? 0,
        outputTokens: entry.usage?.outputTokens ?? 0,
        costUsd: new Prisma.Decimal(entry.cost ?? 0),
        latencyMs: Date.now() - started,
      },
    });
  };
  const refusal = async (
    refused: AssistantRefusal,
    extra: Parameters<typeof record>[0] = {},
    sources: AssistantSource[] = [],
  ): Promise<AssistantReply> => {
    await record({ ...extra, refused });
    return {
      mode: input.mode,
      refused,
      answer: null,
      questions: null,
      sources,
      resources: await gapResources(user.studentId),
      remainingToday,
    };
  };

  const courseIds = await studentCourseIds(user.studentId);
  const counts = await approvedCounts(courseIds);
  const askable = courseIds.filter((id) => (counts.get(id) ?? 0) > 0);
  if (askable.length === 0) return refusal('NO_COURSE');

  const [query] = await embeddingProvider().embed([input.question], 'query');
  const hits = await search(askable, query!, topK);
  const best = hits[0]?.similarity ?? null;
  const chunkIds = hits.map((h) => h.id);
  if (!relevantEnough(best, minSimilarity)) {
    return refusal('NOT_IN_MATERIALS', { chunkIds, best });
  }

  const sources: AssistantSource[] = hits.map((h, i) => ({
    n: i + 1,
    chunkId: h.id,
    materialId: h.materialId,
    materialTitle: h.title,
    excerpt:
      h.content.length > EXCERPT_PREVIEW ? `${h.content.slice(0, EXCERPT_PREVIEW)}…` : h.content,
  }));
  const provider = assistantProvider();
  const result = await provider.generate({
    mode: input.mode,
    question: input.question,
    language: LANGUAGE[user.locale],
    excerpts: hits.map((h, i) => ({ n: i + 1, title: h.title, text: h.content })),
  });
  const cost = costUsd(result.usage, provider.price);
  const spentExtra = { chunkIds, best, usage: result.usage, cost };

  if (result.offTopic) return refusal('OFF_TOPIC', spentExtra);
  let questions: PracticeQuestion[] | null = null;
  if (input.mode === 'practice') {
    questions = validQuestions(result.questions ?? [], hits.length);
    if (questions.length === 0) {
      logger.warn({ received: result.questions?.length ?? 0 }, 'assistant gave no valid questions');
      return refusal('NOT_IN_MATERIALS', spentExtra);
    }
  } else if (!result.answer?.trim()) {
    return refusal('NOT_IN_MATERIALS', spentExtra);
  }

  await record(spentExtra);
  return {
    mode: input.mode,
    refused: null,
    answer: input.mode === 'practice' ? null : result.answer!.trim(),
    questions,
    sources,
    resources: await gapResources(user.studentId),
    remainingToday,
  };
}

/** GET /assistant/usage (Admin, BRQ-17.5): this month's questions, refusals, tokens and cost. */
export async function usage(): Promise<AssistantUsage> {
  const ai = aiConfig();
  const { month, monthLabel } = await periodStarts();
  const where = { createdAt: { gte: month } };
  const [agg, refusals, modes] = await Promise.all([
    prisma().assistantLog.aggregate({
      where,
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, costUsd: true },
      _avg: { latencyMs: true },
    }),
    prisma().assistantLog.groupBy({
      by: ['refusalReason'],
      where: { ...where, refused: true },
      _count: { _all: true },
    }),
    prisma().assistantLog.groupBy({ by: ['mode'], where, _count: { _all: true } }),
  ]);
  const refusalCounts = Object.fromEntries(
    refusals.map((r) => [r.refusalReason ?? 'UNKNOWN', r._count._all]),
  );
  const refusedTotal = refusals.reduce((s, r) => s + r._count._all, 0);
  return {
    enabled: ai.enabled,
    month: monthLabel,
    questions: agg._count._all,
    answered: agg._count._all - refusedTotal,
    refusals: refusalCounts,
    inputTokens: agg._sum.inputTokens ?? 0,
    outputTokens: agg._sum.outputTokens ?? 0,
    costUsd: Number(agg._sum.costUsd ?? 0),
    monthlyCapUsd: ai.monthlyCapUsd,
    averageLatencyMs: agg._avg.latencyMs === null ? null : Math.round(agg._avg.latencyMs),
    byMode: Object.fromEntries(modes.map((m) => [m.mode, m._count._all])),
  };
}

// ─── Materials (Admin, BRQ-17.2) ───────────────────────────────────────────────

async function courseTitles(): Promise<Map<string, string>> {
  const list = await courses.listCourses();
  return new Map(list.map((c) => [c.id, c.title]));
}

const isMaterialMime = (m: string): m is (typeof MATERIAL_MIME)[number] =>
  (MATERIAL_MIME as readonly string[]).includes(m);

async function checkMaterialFile(contentType: string, sizeBytes: number) {
  const maxBytes = await settings.get('assistant.materialMaxBytes');
  if (!isMaterialMime(contentType)) {
    throw AppError.unprocessable('UNSUPPORTED_TYPE', 'Upload a PDF or a text file', [
      { path: 'contentType', message: `Allowed: ${MATERIAL_MIME.join(', ')}` },
    ]);
  }
  if (sizeBytes > maxBytes) {
    throw AppError.unprocessable(
      'FILE_TOO_LARGE',
      `Files can be at most ${Math.floor(maxBytes / (1024 * 1024))} MB`,
      [{ path: 'sizeBytes', message: `Max ${maxBytes} bytes` }],
    );
  }
  return maxBytes;
}

async function requireCourse(courseId: string): Promise<string> {
  const title = (await courseTitles()).get(courseId);
  if (!title) {
    throw AppError.unprocessable('COURSE_NOT_FOUND', 'Choose an existing course', [
      { path: 'courseId', message: 'Unknown course' },
    ]);
  }
  return title;
}

/** POST /materials/upload-url: a one-object upload target under the course's prefix. */
export async function uploadUrl(input: MaterialUploadUrlInput): Promise<UploadTarget> {
  await requireCourse(input.courseId);
  const maxBytes = await checkMaterialFile(input.contentType, input.sizeBytes);
  const ttlSeconds = await settings.get('evidence.uploadTtlSeconds');
  const key = `materials/${input.courseId}/${randomUUID()}.${EXTENSION[input.contentType]}`;
  return storage().uploadTarget(key, { contentType: input.contentType, maxBytes, ttlSeconds });
}

type MaterialRow = Prisma.MaterialGetPayload<object>;

async function toDtos(rows: MaterialRow[]): Promise<MaterialDto[]> {
  const [titles, names] = await Promise.all([
    courseTitles(),
    users.userNames(
      rows.flatMap((r) => [r.uploadedById, ...(r.approvedById ? [r.approvedById] : [])]),
    ),
  ]);
  return rows.map((r) => ({
    id: r.id,
    courseId: r.courseId,
    courseTitle: titles.get(r.courseId) ?? '',
    title: r.title,
    mime: r.mime,
    sizeBytes: r.sizeBytes,
    status: r.status,
    chunkCount: r.chunkCount,
    uploadedBy: names.get(r.uploadedById) ?? '',
    approvedBy: r.approvedById ? (names.get(r.approvedById) ?? '') : null,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function listMaterials(courseId?: string): Promise<MaterialDto[]> {
  const rows = await prisma().material.findMany({
    where: courseId ? { courseId } : {},
    orderBy: [{ createdAt: 'desc' }],
  });
  return toDtos(rows);
}

async function getMaterial(id: string): Promise<MaterialRow> {
  const m = await prisma().material.findUnique({ where: { id } });
  if (!m) throw AppError.notFound('Material not found');
  return m;
}

/** POST /materials: records an uploaded file as PENDING; nothing is searchable yet. Audited. */
export async function createMaterial(
  actor: Actor,
  input: MaterialCreateInput,
): Promise<MaterialDto> {
  await requireCourse(input.courseId);
  if (!input.key.startsWith(`materials/${input.courseId}/`)) {
    throw AppError.unprocessable('INVALID_KEY', 'That upload does not belong to this course');
  }
  const info = await storage().stat(input.key);
  if (!info) throw AppError.unprocessable('UPLOAD_NOT_FOUND', 'Upload the file first');
  const mime = info.contentType.split(';')[0]!.trim().toLowerCase();
  await checkMaterialFile(mime, info.size);
  const used = await prisma().material.count({ where: { objectKey: input.key } });
  if (used) throw AppError.conflict('ALREADY_ATTACHED', 'This file is already added');

  const created = await withAudit(actor, async (tx, log) => {
    const m = await tx.material.create({
      data: {
        courseId: input.courseId,
        title: input.title,
        objectKey: input.key,
        mime,
        sizeBytes: info.size,
        uploadedById: actor.userId!,
      },
    });
    await log({
      action: 'MATERIAL_UPLOADED',
      entity: 'Material',
      entityId: m.id,
      newValue: { courseId: m.courseId, title: m.title, mime, sizeBytes: m.sizeBytes },
    });
    return m;
  });
  return (await toDtos([created]))[0]!;
}

/** Plain text of a stored material: PDF text layer or UTF-8 text. */
async function extract(m: MaterialRow): Promise<string> {
  const body = await storage().get(m.objectKey);
  if (!body) throw AppError.unprocessable('UPLOAD_NOT_FOUND', 'The file is missing from storage');
  if (m.mime === 'application/pdf') {
    try {
      return await pdfText()(body);
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'PDF text failed');
      throw AppError.unprocessable('NO_TEXT', 'The PDF could not be read');
    }
  }
  return body.toString('utf8');
}

/**
 * POST /materials/:id/approve (BR-21): extracts the text, splits it into excerpts, embeds them
 * and makes the material searchable. Text and embeddings are prepared before the transaction
 * (one pooled connection in production). A scanned PDF with no text layer is refused.
 */
export async function approveMaterial(actor: Actor, id: string): Promise<MaterialDto> {
  const m = await getMaterial(id);
  if (m.status !== 'PENDING') {
    throw AppError.conflict('NOT_PENDING', 'Only materials waiting for review can be approved');
  }
  const [maxTokens, overlap] = await Promise.all([
    settings.get('assistant.chunkTokens'),
    settings.get('assistant.chunkOverlapTokens'),
  ]);
  const chunks = chunkText(await extract(m), maxTokens, overlap);
  if (chunks.length === 0) {
    throw AppError.unprocessable('NO_TEXT', 'No text was found in this file (is it a scan?)');
  }
  const vectors = await embeddingProvider().embed(chunks, 'document');

  const approved = await withAudit(actor, async (tx, log) => {
    const current = await tx.material.findUnique({ where: { id }, select: { status: true } });
    if (current?.status !== 'PENDING') {
      throw AppError.conflict('NOT_PENDING', 'Only materials waiting for review can be approved');
    }
    await tx.$executeRaw`
      INSERT INTO material_chunks (id, material_id, ordinal, content, token_count, embedding)
      SELECT gen_random_uuid(), ${id}::uuid, x.ordinal, x.content, x.tokens, x.embedding::vector
      FROM unnest(
        ${chunks.map((_, i) => i)}::int[],
        ${chunks}::text[],
        ${chunks.map(estimateTokens)}::int[],
        ${vectors.map(vectorLiteral)}::text[]
      ) AS x(ordinal, content, tokens, embedding)`;
    const updated = await tx.material.update({
      where: { id },
      data: {
        status: 'APPROVED',
        chunkCount: chunks.length,
        approvedById: actor.userId!,
        approvedAt: new Date(),
      },
    });
    await log({
      action: 'MATERIAL_APPROVED',
      entity: 'Material',
      entityId: id,
      oldValue: { status: m.status },
      newValue: { status: 'APPROVED', chunkCount: chunks.length },
    });
    return updated;
  });
  return (await toDtos([approved]))[0]!;
}

/** POST /materials/:id/reject: a pending material the assistant must not use. Audited. */
export async function rejectMaterial(actor: Actor, id: string): Promise<MaterialDto> {
  const m = await getMaterial(id);
  if (m.status !== 'PENDING') {
    throw AppError.conflict('NOT_PENDING', 'Only materials waiting for review can be rejected');
  }
  const rejected = await withAudit(actor, async (tx, log) => {
    const updated = await tx.material.update({ where: { id }, data: { status: 'REJECTED' } });
    await log({
      action: 'MATERIAL_REJECTED',
      entity: 'Material',
      entityId: id,
      oldValue: { status: m.status },
      newValue: { status: 'REJECTED' },
    });
    return updated;
  });
  return (await toDtos([rejected]))[0]!;
}

/** DELETE /materials/:id: removes the material and its excerpts from search. Audited. */
export async function removeMaterial(actor: Actor, id: string): Promise<void> {
  const m = await getMaterial(id);
  await withAudit(actor, async (tx, log) => {
    await tx.material.delete({ where: { id } });
    await log({
      action: 'MATERIAL_DELETED',
      entity: 'Material',
      entityId: id,
      oldValue: {
        courseId: m.courseId,
        title: m.title,
        status: m.status,
        chunkCount: m.chunkCount,
      },
    });
  });
}
