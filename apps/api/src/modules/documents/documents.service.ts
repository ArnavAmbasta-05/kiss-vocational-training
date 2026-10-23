import type { Prisma } from '@prisma/client';
import type {
  CertificateDto,
  CertificateListQuery,
  CertificateSummary,
  Grade,
  Paginated,
} from '@vtmp/shared';
import { withAudit, type Actor, type AuditFn } from '../../core/audit';
import { config } from '../../core/config';
import { prisma, type Tx } from '../../core/db';
import { AppError } from '../../core/errors';
import { paginated, type PageRequest } from '../../core/http';
import { settings } from '../../core/settings';
import { storage } from '../../core/storage';
import * as batches from '../batches/batches.service';
import * as enrollments from '../enrollments/enrollments.service';
import { renderCertificate } from './certificate.pdf';
import { publicCode } from './code';

const num = (d: Prisma.Decimal) => Number(d);

const certificateInclude = {
  issuedBy: { select: { fullName: true } },
  enrollment: {
    select: {
      cycle: { select: { name: true } },
      student: { select: { rollNo: true, user: { select: { fullName: true } } } },
      batchMembership: {
        select: { batch: { select: { name: true, course: { select: { title: true } } } } },
      },
    },
  },
} satisfies Prisma.CertificateInclude;
type CertificateRow = Prisma.CertificateGetPayload<{ include: typeof certificateInclude }>;

function toSummary(c: {
  id: string;
  publicCode: string;
  status: CertificateSummary['status'];
  issuedAt: Date;
  pdfObjectKey: string | null;
}): CertificateSummary {
  return {
    id: c.id,
    publicCode: c.publicCode,
    status: c.status,
    issuedAt: c.issuedAt.toISOString(),
    rendered: c.pdfObjectKey !== null,
  };
}

function toDto(c: CertificateRow): CertificateDto {
  const batch = c.enrollment.batchMembership?.batch;
  return {
    ...toSummary(c),
    enrollmentId: c.enrollmentId,
    studentName: c.enrollment.student.user.fullName,
    rollNo: c.enrollment.student.rollNo,
    courseTitle: batch?.course.title ?? '',
    batchName: batch?.name ?? '',
    cycleName: c.enrollment.cycle.name,
    grade: c.grade,
    aggregatePercent: num(c.aggregatePercent),
    attendancePercent: num(c.attendancePercent),
    issuedBy: c.issuedBy.fullName,
  };
}

export interface NewCertificate {
  enrollmentId: string;
  grade: Exclude<Grade, 'NOT_COMPLETED'>;
  aggregatePercent: number;
  attendancePercent: number;
  issuedById: string;
}

/**
 * Creates the certificate record inside the caller's transaction (TAD §8.1 step 4): a random
 * public code (BR-10, BR-19) and snapshots of grade, aggregate and attendance at approval. The
 * database allows one VALID certificate per enrollment, so a concurrent second approval fails.
 */
export async function createCertificate(
  tx: Tx,
  log: AuditFn,
  input: NewCertificate,
): Promise<CertificateSummary> {
  const c = await tx.certificate.create({
    data: {
      enrollmentId: input.enrollmentId,
      publicCode: publicCode(),
      grade: input.grade,
      aggregatePercent: input.aggregatePercent,
      attendancePercent: input.attendancePercent,
      issuedById: input.issuedById,
    },
  });
  await log({
    action: 'CERTIFICATE_ISSUED',
    entity: 'Certificate',
    entityId: c.id,
    newValue: {
      enrollmentId: c.enrollmentId,
      publicCode: c.publicCode,
      grade: c.grade,
      aggregatePercent: input.aggregatePercent,
      attendancePercent: input.attendancePercent,
    },
  });
  return toSummary(c);
}

const objectKey = (id: string) => `certificates/${id}.pdf`;

/**
 * TAD §8.1 step 5: renders the PDF (with the QR of the verification URL), stores it and
 * records the object key. Throws on any failure; the caller keeps the enrollment COMPLETED so
 * the admin can retry. Rendering the same certificate again overwrites the same object.
 */
export async function renderAndStore(
  actor: Actor,
  certificateId: string,
): Promise<CertificateSummary> {
  const c = await prisma().certificate.findUnique({ where: { id: certificateId } });
  if (!c) throw AppError.notFound('Certificate not found');
  const [facts, placement, institution] = await Promise.all([
    enrollments.placementFacts(c.enrollmentId),
    batches.placementOf(c.enrollmentId),
    settings.get('institution.name'),
  ]);
  if (!facts || !placement) throw AppError.conflict('NOT_IN_TRAINING', 'No batch placement');

  const pdf = await renderCertificate({
    institution,
    studentName: facts.fullName,
    rollNo: facts.rollNo,
    courseTitle: placement.batch.courseTitle,
    batchName: placement.batch.name,
    startDate: placement.batch.startDate,
    endDate: placement.batch.endDate,
    grade: c.grade,
    aggregatePercent: num(c.aggregatePercent),
    attendancePercent: num(c.attendancePercent),
    issuedAt: c.issuedAt,
    publicCode: c.publicCode,
    verifyUrl: `${config().PUBLIC_BASE_URL.replace(/\/$/, '')}/verify/${c.publicCode}`,
  });
  const key = objectKey(c.id);
  await storage().put(key, pdf, 'application/pdf');

  return withAudit(actor, async (tx, log) => {
    const updated = await tx.certificate.update({
      where: { id: c.id },
      data: { pdfObjectKey: key },
    });
    await log({
      action: 'CERTIFICATE_RENDERED',
      entity: 'Certificate',
      entityId: c.id,
      oldValue: { pdfObjectKey: c.pdfObjectKey },
      newValue: { pdfObjectKey: key, bytes: pdf.length },
    });
    return toSummary(updated);
  });
}

/** The stored PDF, for the owner student or an admin (ownership is checked by the route). */
export async function download(certificateId: string): Promise<{ pdf: Buffer; filename: string }> {
  const c = await prisma().certificate.findUnique({ where: { id: certificateId } });
  if (!c) throw AppError.notFound('Certificate not found');
  if (!c.pdfObjectKey) {
    throw AppError.conflict('CERTIFICATE_NOT_RENDERED', 'The certificate PDF is not ready yet');
  }
  const pdf = await storage().get(c.pdfObjectKey);
  if (!pdf) {
    throw AppError.conflict('CERTIFICATE_NOT_RENDERED', 'The certificate PDF is not ready yet');
  }
  return { pdf, filename: `certificate-${c.publicCode}.pdf` };
}

export async function get(certificateId: string): Promise<CertificateDto> {
  const c = await prisma().certificate.findUnique({
    where: { id: certificateId },
    include: certificateInclude,
  });
  if (!c) throw AppError.notFound('Certificate not found');
  return toDto(c);
}

/** BRQ-7.3: register of every certificate issued, newest first, searchable. */
export async function list(
  query: CertificateListQuery,
  page: PageRequest,
): Promise<Paginated<CertificateDto>> {
  const q = query.q?.trim();
  const where: Prisma.CertificateWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(q
      ? {
          OR: [
            { publicCode: { contains: q.toUpperCase() } },
            { enrollment: { student: { rollNo: { contains: q, mode: 'insensitive' } } } },
            {
              enrollment: {
                student: { user: { fullName: { contains: q, mode: 'insensitive' } } },
              },
            },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma().certificate.findMany({
      where,
      include: certificateInclude,
      orderBy: [{ issuedAt: 'desc' }, { id: 'asc' }],
      skip: page.skip,
      take: page.take,
    }),
    prisma().certificate.count({ where }),
  ]);
  return paginated(rows.map(toDto), total, page);
}

/** A student's certificates, newest first (their dashboard and enrollment page). */
export async function forStudent(studentId: string): Promise<CertificateDto[]> {
  const rows = await prisma().certificate.findMany({
    where: { enrollment: { studentId } },
    include: certificateInclude,
    orderBy: { issuedAt: 'desc' },
  });
  return rows.map(toDto);
}

/** The current VALID certificate of each application, if any (completion queue). */
export async function validFor(enrollmentIds: string[]): Promise<Map<string, CertificateSummary>> {
  const rows = await prisma().certificate.findMany({
    where: { enrollmentId: { in: enrollmentIds }, status: 'VALID' },
  });
  return new Map(rows.map((c) => [c.enrollmentId, toSummary(c)]));
}

/** The enrollment a certificate belongs to (completion retry). */
export async function enrollmentOf(certificateId: string): Promise<string | null> {
  const c = await prisma().certificate.findUnique({
    where: { id: certificateId },
    select: { enrollmentId: true },
  });
  return c?.enrollmentId ?? null;
}

/** Grades on valid certificates, optionally for one course (dashboard, course report). */
export async function gradeDistribution(courseId?: string): Promise<Map<string, number>> {
  const rows = await prisma().certificate.groupBy({
    by: ['grade'],
    where: {
      status: 'VALID',
      ...(courseId ? { enrollment: { batchMembership: { batch: { courseId } } } } : {}),
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.grade, r._count._all]));
}

// ─── Reports (F8, BRD §12.2) ───────────────────────────────────────────────────

export { renderStudentReport, renderTableReport } from './reports.pdf';
export { pdfDay } from './pdf';
export type { StudentReportContent, TableReportContent } from './reports.pdf';

/**
 * Keeps the figures a student report was generated from (BRQ-8.1, rule 9: report snapshots
 * are stored, live figures are not). The PDF itself is re-generated on request.
 */
export async function savePerformanceReport(
  actor: Actor,
  enrollmentId: string,
  snapshot: unknown,
): Promise<string> {
  return withAudit(actor, async (tx, log) => {
    const r = await tx.performanceReport.create({
      data: {
        enrollmentId,
        snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
        generatedById: actor.userId!,
      },
    });
    await log({
      action: 'PERFORMANCE_REPORT_GENERATED',
      entity: 'PerformanceReport',
      entityId: r.id,
      newValue: { enrollmentId },
    });
    return r.id;
  });
}

/** Grades on valid certificates of one batch (course report). */
export async function batchGrades(batchId: string): Promise<Map<string, number>> {
  const rows = await prisma().certificate.groupBy({
    by: ['grade'],
    where: { status: 'VALID', enrollment: { batchMembership: { batchId } } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.grade, r._count._all]));
}
