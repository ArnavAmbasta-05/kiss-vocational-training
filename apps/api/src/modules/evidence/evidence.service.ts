import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type {
  EvidenceAttachInput,
  EvidenceDto,
  EvidenceSheet,
  RubricDto,
  RubricInput,
  SignedFileUrl,
  UploadTarget,
  UploadUrlInput,
} from '@vtmp/shared';
import { withAudit, type Actor } from '../../core/audit';
import { prisma } from '../../core/db';
import { AppError } from '../../core/errors';
import { settings } from '../../core/settings';
import { storage } from '../../core/storage';
import * as assessments from '../assessments/assessments.service';
import * as batches from '../batches/batches.service';
import * as competency from '../competency/competency.service';
import * as users from '../users/users.service';

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** The batch's course must have this competency (BRQ-18.3). */
async function practicalContext(resultId: string) {
  const ctx = await assessments.resultContext(resultId);
  if (!ctx) throw AppError.notFound('Result not found');
  if (ctx.mode !== 'PRACTICAL') {
    throw AppError.unprocessable(
      'NOT_PRACTICAL',
      'Evidence is attached to practical assessments only',
    );
  }
  const batch = await batches.courseOf(ctx.batchId);
  if (!batch) throw AppError.notFound('Batch not found');
  if (batch.status === 'CLOSED') throw AppError.conflict('BATCH_CLOSED', 'This batch is closed');
  return { ...ctx, courseId: batch.courseId };
}

/** File rules from Settings (rule 4): type allow-list and size limit (NFR-14). */
async function checkFile(contentType: string, sizeBytes: number) {
  const [allowed, maxBytes] = await Promise.all([
    settings.get('evidence.allowedMime'),
    settings.get('evidence.maxBytes'),
  ]);
  if (!allowed.includes(contentType) || !EXTENSION[contentType]) {
    throw AppError.unprocessable('UNSUPPORTED_TYPE', 'Upload a JPEG, PNG or WebP photo or a PDF', [
      { path: 'contentType', message: `Allowed: ${allowed.join(', ')}` },
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

/**
 * POST /evidence/upload-url (BRQ-18.1): a one-object upload target for the browser, limited to
 * a server-chosen key under the result, this file type and the size limit. Nothing is stored
 * until the trainer attaches the uploaded file.
 */
export async function uploadUrl(input: UploadUrlInput): Promise<UploadTarget> {
  await practicalContext(input.resultId);
  const maxBytes = await checkFile(input.contentType, input.sizeBytes);
  const ttlSeconds = await settings.get('evidence.uploadTtlSeconds');
  const key = `evidence/${input.resultId}/${randomUUID()}.${EXTENSION[input.contentType]}`;
  return storage().uploadTarget(key, { contentType: input.contentType, maxBytes, ttlSeconds });
}

type EvidenceRow = Prisma.PracticalEvidenceGetPayload<{
  include: { competency: { select: { id: true; code: true; title: true } } };
}>;

function toDto(e: EvidenceRow, names: Map<string, string>): EvidenceDto {
  return {
    id: e.id,
    resultId: e.resultId,
    kind: e.kind,
    fileName: e.fileName,
    mime: e.mime,
    sizeBytes: e.sizeBytes,
    url: e.kind === 'LINK' ? e.url : null,
    competency: e.competency,
    scores: (e.scores as Record<string, number> | null) ?? null,
    note: e.note,
    uploadedBy: names.get(e.uploadedById) ?? '',
    createdAt: e.createdAt.toISOString(),
  };
}

const include = { competency: { select: { id: true, code: true, title: true } } } as const;

async function toDtos(rows: EvidenceRow[]): Promise<EvidenceDto[]> {
  const names = await users.userNames(rows.map((r) => r.uploadedById));
  return rows.map((r) => toDto(r, names));
}

/** Rubric scores must name the rubric's criteria and use its levels (BRQ-18.2). */
function checkScores(scores: Record<string, number> | undefined, rubric: RubricDto | null) {
  if (!scores || Object.keys(scores).length === 0) return null;
  if (!rubric) {
    throw AppError.unprocessable('NO_RUBRIC', 'This assessment has no rubric to score against');
  }
  const keys = new Set(rubric.criteria.map((c) => c.key));
  const levels = new Set(rubric.levels.map((l) => l.value));
  const bad = Object.entries(scores).filter(([k, v]) => !keys.has(k) || !levels.has(v));
  if (bad.length) {
    throw AppError.unprocessable(
      'INVALID_SCORES',
      'Scores must use the rubric criteria and levels',
      bad.map(([k]) => ({ path: `scores.${k}`, message: 'Not a rubric criterion or level' })),
    );
  }
  return scores;
}

/**
 * POST /results/:resultId/evidence (BRQ-18.1–18.3): records an uploaded file (checked in the
 * store: it must exist under this result's prefix, with an allowed type and size) or a video
 * link, the competency it proves, and rubric scores. Audited.
 */
export async function attach(
  actor: Actor,
  resultId: string,
  input: EvidenceAttachInput,
): Promise<EvidenceDto> {
  const ctx = await practicalContext(resultId);
  if (input.competencyId) {
    const comps = await competency.listCompetencies(ctx.courseId);
    if (!comps.some((c) => c.id === input.competencyId)) {
      throw AppError.unprocessable('INVALID_COMPETENCY', 'The competency is not in this course', [
        { path: 'competencyId', message: 'Not in this course' },
      ]);
    }
  }
  const scores = checkScores(input.scores, await rubric(ctx.assessmentId));

  let file: { objectKey: string; mime: string; sizeBytes: number; fileName: string } | null = null;
  if (input.kind === 'FILE') {
    if (!input.key.startsWith(`evidence/${resultId}/`)) {
      throw AppError.unprocessable('INVALID_KEY', 'That upload does not belong to this result');
    }
    const info = await storage().stat(input.key);
    if (!info) throw AppError.unprocessable('UPLOAD_NOT_FOUND', 'Upload the file first');
    await checkFile(info.contentType, info.size);
    file = {
      objectKey: input.key,
      mime: info.contentType,
      sizeBytes: info.size,
      fileName: input.fileName,
    };
    const used = await prisma().practicalEvidence.count({ where: { objectKey: input.key } });
    if (used) throw AppError.conflict('ALREADY_ATTACHED', 'This file is already attached');
  }

  // Read before the transaction: production pools a single connection per instance.
  const names = await users.userNames([actor.userId!]);
  return withAudit(actor, async (tx, log) => {
    const created = await tx.practicalEvidence.create({
      data: {
        resultId,
        competencyId: input.competencyId ?? null,
        kind: input.kind,
        objectKey: file?.objectKey ?? null,
        url: input.kind === 'LINK' ? input.url : null,
        fileName: file?.fileName ?? null,
        mime: file?.mime ?? null,
        sizeBytes: file?.sizeBytes ?? null,
        scores: scores ?? undefined,
        note: input.note || null,
        uploadedById: actor.userId!,
      },
      include,
    });
    await log({
      action: 'EVIDENCE_ATTACHED',
      entity: 'PracticalEvidence',
      entityId: created.id,
      newValue: {
        resultId,
        studentId: ctx.studentId,
        kind: created.kind,
        competencyId: created.competencyId,
        fileName: created.fileName,
        sizeBytes: created.sizeBytes,
        url: created.url,
        scores,
      },
    });
    return toDto(created, names);
  });
}

/** A short-lived link to open a file; links are returned as they are (TAD §9). */
export async function fileUrl(evidenceId: string): Promise<SignedFileUrl> {
  const e = await prisma().practicalEvidence.findUnique({ where: { id: evidenceId } });
  if (!e) throw AppError.notFound('Evidence not found');
  if (e.kind === 'LINK') return { url: e.url!, expiresAt: '' };
  const ttl = await settings.get('evidence.downloadTtlSeconds');
  return storage().signedUrl(e.objectKey!, ttl);
}

/** For the ownership resolver: the result an evidence row belongs to. */
export async function resultOfEvidence(evidenceId: string): Promise<string | null> {
  const e = await prisma().practicalEvidence.findUnique({
    where: { id: evidenceId },
    select: { resultId: true },
  });
  return e?.resultId ?? null;
}

// ─── Rubrics (BRQ-18.2) ────────────────────────────────────────────────────────

export async function rubric(assessmentId: string): Promise<RubricDto | null> {
  const r = await prisma().rubric.findUnique({ where: { assessmentId } });
  return r
    ? {
        id: r.id,
        assessmentId: r.assessmentId,
        criteria: r.criteria as RubricDto['criteria'],
        levels: r.levels as RubricDto['levels'],
        updatedAt: r.updatedAt.toISOString(),
      }
    : null;
}

export async function saveRubric(
  actor: Actor,
  assessmentId: string,
  input: RubricInput,
): Promise<RubricDto> {
  const sheet = await assessments.resultsSheet(assessmentId);
  if (sheet.assessment.mode !== 'PRACTICAL') {
    throw AppError.unprocessable('NOT_PRACTICAL', 'Rubrics are for practical assessments');
  }
  const before = await rubric(assessmentId);
  await withAudit(actor, async (tx, log) => {
    const data = {
      criteria: input.criteria as unknown as Prisma.InputJsonValue,
      levels: input.levels as unknown as Prisma.InputJsonValue,
    };
    const saved = await tx.rubric.upsert({
      where: { assessmentId },
      create: { assessmentId, createdById: actor.userId!, ...data },
      update: data,
    });
    await log({
      action: before ? 'RUBRIC_UPDATED' : 'RUBRIC_CREATED',
      entity: 'Rubric',
      entityId: saved.id,
      oldValue: before ? { criteria: before.criteria, levels: before.levels } : undefined,
      newValue: input,
    });
  });
  return (await rubric(assessmentId))!;
}

/** GET /assessments/:id/evidence: the roster's results with their evidence (trainer screen). */
export async function sheet(assessmentId: string): Promise<EvidenceSheet> {
  const results = await assessments.resultsSheet(assessmentId);
  const batch = await batches.courseOf(results.assessment.batchId);
  const [ids, r, comps] = await Promise.all([
    assessments.resultIds(assessmentId),
    rubric(assessmentId),
    batch ? competency.listCompetencies(batch.courseId) : Promise.resolve([]),
  ]);
  const evidence = await prisma().practicalEvidence.findMany({
    where: { resultId: { in: [...ids.values()] } },
    orderBy: { createdAt: 'asc' },
    include,
  });
  const dtos = await toDtos(evidence);
  return {
    assessmentId,
    title: results.assessment.title,
    rubric: r,
    competencies: comps
      .filter((c) => c.mode === 'PRACTICAL')
      .map((c) => ({ id: c.id, code: c.code, title: c.title })),
    rows: results.rows
      .filter((row) => ids.has(row.studentId) && row.marks !== null)
      .map((row) => {
        const resultId = ids.get(row.studentId)!;
        return {
          resultId,
          studentId: row.studentId,
          rollNo: row.rollNo,
          fullName: row.fullName,
          marks: row.marks!,
          evidence: dtos.filter((d) => d.resultId === resultId),
        };
      }),
  };
}

/**
 * BRQ-10.2: evidence linked to each competency for one student's signed-in passport. Labels
 * are file names or "Video link"; the files open through fileUrl.
 */
export async function forPassport(
  studentId: string,
): Promise<Map<string, Array<{ id: string; kind: 'FILE' | 'LINK'; label: string }>>> {
  const rows = await prisma().practicalEvidence.findMany({
    where: { competencyId: { not: null }, result: { studentId } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, kind: true, fileName: true, competencyId: true },
  });
  const out = new Map<string, Array<{ id: string; kind: 'FILE' | 'LINK'; label: string }>>();
  for (const r of rows) {
    const list = out.get(r.competencyId!) ?? [];
    list.push({ id: r.id, kind: r.kind, label: r.fileName ?? 'Video link' });
    out.set(r.competencyId!, list);
  }
  return out;
}
