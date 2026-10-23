import type { EnrollmentStatus, Grade, ReportFormat } from '@vtmp/shared';
import type { Actor } from '../../core/audit';
import { AppError } from '../../core/errors';
import { settings } from '../../core/settings';
import * as assessments from '../assessments/assessments.service';
import { gradeBand, weightedAggregate } from '../assessments/rules';
import * as attendance from '../attendance/attendance.service';
import * as batches from '../batches/batches.service';
import * as courses from '../courses/courses.service';
import * as documents from '../documents/documents.service';
import * as enrollments from '../enrollments/enrollments.service';
import { toCsv } from './csv';
import { completionRate } from './rules';

export interface ReportFile {
  body: Buffer | string;
  contentType: string;
  filename: string;
}

/** Reports are English documents (TAD §15); statuses read as words, not codes. */
const STATUS_TEXT: Record<EnrollmentStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Not approved',
  WAITLISTED: 'Waitlisted',
  ALLOCATED: 'Allocated',
  ACTIVE: 'In training',
  COMPLETED: 'Completed',
  NOT_COMPLETED: 'Not completed',
  CERTIFIED: 'Certified',
  WITHDRAWN: 'Withdrawn',
};
const GRADES = ['A', 'B', 'C', 'D'] as const;
const FINISHED: readonly EnrollmentStatus[] = ['COMPLETED', 'CERTIFIED'];

const two = (n: number | null) => (n === null ? null : Number(n.toFixed(2)));
const pctText = (n: number | null) => (n === null ? '—' : `${n.toFixed(2)} %`);
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'report';

// ─── Student performance report (BRQ-8.1) ──────────────────────────────────────

export async function studentReport(
  actor: Actor,
  studentId: string,
  enrollmentId?: string,
): Promise<ReportFile> {
  const placements = await batches.placementsOf(studentId);
  const p = enrollmentId ? placements.find((x) => x.enrollmentId === enrollmentId) : placements[0];
  if (!p) throw AppError.notFound('This student has no training to report on yet');

  const [facts, figures, results, evaluation, notes, bands, minimum, institution, certs] =
    await Promise.all([
      enrollments.placementFacts(p.enrollmentId),
      attendance.studentFigures(p.batch.id, studentId),
      assessments.studentResults(p.batch.id, studentId),
      assessments.evaluationFor(p.enrollmentId),
      assessments.progress(p.batch.id, studentId),
      settings.get('grade.bands'),
      settings.get('attendance.minPercent'),
      settings.get('institution.name'),
      documents.validFor([p.enrollmentId]),
    ]);
  if (!facts) throw AppError.notFound();

  // A certified student's report shows the snapshot on the certificate; others the live figures.
  const cert = certs.get(p.enrollmentId);
  const certified = cert ? await documents.get(cert.id) : null;
  const live = weightedAggregate(
    results
      .filter((r) => r.marks !== null)
      .map((r) => ({ marks: r.marks!, maxMarks: r.maxMarks, weightage: r.weightage })),
  );
  const aggregate = certified ? certified.aggregatePercent : live;
  const grade: Grade | null = certified
    ? certified.grade
    : live === null
      ? null
      : gradeBand(live, bands);

  const content: documents.StudentReportContent = {
    institution,
    generatedAt: new Date(),
    student: { fullName: facts.fullName, rollNo: facts.rollNo },
    course: {
      title: p.batch.courseTitle,
      batchName: p.batch.name,
      cycleName: facts.cycleName,
      startDate: p.batch.startDate,
      endDate: p.batch.endDate,
    },
    status: STATUS_TEXT[facts.status],
    attendance: {
      attended: figures.attended,
      conducted: figures.conducted,
      percent: figures.percent,
      minimum,
    },
    results: results.map((r) => ({
      title: r.title,
      mode: r.mode,
      heldOn: r.heldOn,
      marks: r.marks,
      maxMarks: r.maxMarks,
      weightage: r.weightage,
      isMandatory: r.isMandatory,
      remarks: r.remarks,
    })),
    aggregate,
    grade,
    gradeIsFinal: !!certified,
    evaluation: evaluation
      ? {
          recommended: evaluation.recommended,
          remarks: evaluation.remarks,
          evaluatedBy: evaluation.evaluatedBy,
          evaluatedAt: evaluation.evaluatedAt,
        }
      : null,
    milestones: notes
      .filter((n) => n.studentId === studentId)
      .map((n) => ({ milestone: n.milestone, note: n.note, recordedAt: n.recordedAt })),
    certificateCode: certified?.publicCode ?? null,
  };

  const { generatedAt: _g, institution: _i, ...snapshot } = content;
  await documents.savePerformanceReport(actor, p.enrollmentId, snapshot);
  return {
    body: await documents.renderStudentReport(content),
    contentType: 'application/pdf',
    filename: `performance-report-${slug(facts.rollNo)}.pdf`,
  };
}

// ─── Batch report (BRQ-8.2) ─────────────────────────────────────────────────────

export async function batchReport(batchId: string, format: ReportFormat): Promise<ReportFile> {
  const batch = await batches.detail(batchId, 'ADMIN');
  const roster = batch.roster ?? [];
  const [summary, list, bands, certs, institution] = await Promise.all([
    attendance.batchSummary(batchId),
    assessments.list(batchId),
    settings.get('grade.bands'),
    documents.validFor(roster.map((r) => r.enrollmentId)),
    settings.get('institution.name'),
  ]);
  const figures = new Map(summary.map((s) => [s.studentId, s]));

  const rows = await Promise.all(
    roster.map(async (r) => {
      const results = await assessments.studentResults(batchId, r.studentId);
      const aggregate = weightedAggregate(
        results
          .filter((x) => x.marks !== null)
          .map((x) => ({ marks: x.marks!, maxMarks: x.maxMarks, weightage: x.weightage })),
      );
      const f = figures.get(r.studentId);
      return {
        rollNo: r.rollNo,
        fullName: r.fullName,
        status: STATUS_TEXT[r.enrollmentStatus as EnrollmentStatus] ?? r.enrollmentStatus,
        attended: f?.attended ?? 0,
        conducted: f?.conducted ?? 0,
        percent: f?.percent ?? null,
        marks: new Map(results.map((x) => [x.assessmentId, x.marks])),
        aggregate,
        grade: aggregate === null ? null : gradeBand(aggregate, bands),
        certificate: certs.get(r.enrollmentId)?.publicCode ?? null,
      };
    }),
  );

  const name = `${batch.courseTitle} · ${batch.name}`;
  const file = `batch-report-${slug(`${batch.courseCode}-${batch.name}`)}`;
  if (format === 'csv') {
    return {
      contentType: 'text/csv; charset=utf-8',
      filename: `${file}.csv`,
      body: toCsv(
        [
          'Roll no',
          'Name',
          'Status',
          'Sessions attended',
          'Sessions conducted',
          'Attendance %',
          ...list.map((a) => `${a.title} (/${a.maxMarks})`),
          'Aggregate %',
          'Grade',
          'Certificate ID',
        ],
        rows.map((r) => [
          r.rollNo,
          r.fullName,
          r.status,
          r.attended,
          r.conducted,
          two(r.percent),
          ...list.map((a) => r.marks.get(a.id) ?? null),
          two(r.aggregate),
          r.grade === null ? null : r.grade === 'NOT_COMPLETED' ? 'Not completed' : r.grade,
          r.certificate,
        ]),
      ),
    };
  }
  return {
    contentType: 'application/pdf',
    filename: `${file}.pdf`,
    body: await documents.renderTableReport({
      institution,
      generatedAt: new Date(),
      title: 'Batch report',
      subtitle: `${name} · ${batch.cycleName} · ${documents.pdfDay(batch.startDate)} to ${documents.pdfDay(batch.endDate)}`,
      columns: [
        { header: 'Roll no', width: 2 },
        { header: 'Name', width: 3.4 },
        { header: 'Status', width: 1.9 },
        { header: 'Attendance', width: 2.2, align: 'right' },
        { header: 'Assessments recorded', width: 2, align: 'right' },
        { header: 'Aggregate', width: 1.6, align: 'right' },
        { header: 'Grade', width: 1.6, align: 'center' },
        { header: 'Certificate ID', width: 3 },
      ],
      rows: rows.map((r) => [
        r.rollNo,
        r.fullName,
        r.status,
        `${pctText(r.percent)} (${r.attended}/${r.conducted})`,
        `${[...r.marks.values()].filter((m) => m !== null).length} of ${list.length}`,
        pctText(r.aggregate),
        r.grade === null ? '—' : r.grade === 'NOT_COMPLETED' ? 'Not completed' : r.grade,
        r.certificate ?? '—',
      ]),
      notes: [
        `${rows.length} students · ${list.length} assessments · per-assessment marks are in the CSV export.`,
        'Grades for students still in training are projections from the marks recorded so far.',
      ],
    }),
  };
}

// ─── Course report (BRQ-8.2) ────────────────────────────────────────────────────

export async function courseReport(courseId: string, format: ReportFormat): Promise<ReportFile> {
  const course = (await courses.listCourses()).find((c) => c.id === courseId);
  if (!course) throw AppError.notFound('Course not found');
  const [list, institution] = await Promise.all([
    batches.list({ courseId }),
    settings.get('institution.name'),
  ]);

  const rows = await Promise.all(
    list.map(async (b) => {
      const [detail, grades] = await Promise.all([
        batches.detail(b.id, 'ADMIN'),
        documents.batchGrades(b.id),
      ]);
      const statuses = (detail.roster ?? []).map((r) => r.enrollmentStatus as EnrollmentStatus);
      const completed = statuses.filter((s) => FINISHED.includes(s)).length;
      const notCompleted = statuses.filter((s) => s === 'NOT_COMPLETED').length;
      return {
        cycle: b.cycleName,
        batch: b.name,
        status: b.status,
        students: statuses.length,
        inTraining: statuses.filter((s) => s === 'ACTIVE').length,
        completed,
        notCompleted,
        rate: completionRate(completed, notCompleted),
        grades: GRADES.map((g) => grades.get(g) ?? 0),
      };
    }),
  );
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const totals = {
    students: sum((r) => r.students),
    inTraining: sum((r) => r.inTraining),
    completed: sum((r) => r.completed),
    notCompleted: sum((r) => r.notCompleted),
    grades: GRADES.map((_, i) => sum((r) => r.grades[i]!)),
  };
  const totalRate = completionRate(totals.completed, totals.notCompleted);

  const file = `course-report-${slug(course.code)}`;
  if (format === 'csv') {
    return {
      contentType: 'text/csv; charset=utf-8',
      filename: `${file}.csv`,
      body: toCsv(
        [
          'Cycle',
          'Batch',
          'Batch status',
          'Students',
          'In training',
          'Completed',
          'Not completed',
          'Completion rate %',
          ...GRADES.map((g) => `Grade ${g}`),
        ],
        [
          ...rows.map((r) => [
            r.cycle,
            r.batch,
            r.status,
            r.students,
            r.inTraining,
            r.completed,
            r.notCompleted,
            r.rate,
            ...r.grades,
          ]),
          [
            'All batches',
            '',
            '',
            totals.students,
            totals.inTraining,
            totals.completed,
            totals.notCompleted,
            totalRate,
            ...totals.grades,
          ],
        ],
      ),
    };
  }
  return {
    contentType: 'application/pdf',
    filename: `${file}.pdf`,
    body: await documents.renderTableReport({
      institution,
      generatedAt: new Date(),
      title: 'Course report',
      subtitle: `${course.title} (${course.code})`,
      columns: [
        { header: 'Cycle', width: 3 },
        { header: 'Batch', width: 2.4 },
        { header: 'Status', width: 1.6 },
        { header: 'Students', width: 1.4, align: 'right' },
        { header: 'In training', width: 1.5, align: 'right' },
        { header: 'Completed', width: 1.5, align: 'right' },
        { header: 'Not completed', width: 1.7, align: 'right' },
        { header: 'Completion rate', width: 1.8, align: 'right' },
        ...GRADES.map((g) => ({ header: g, width: 0.8, align: 'right' as const })),
      ],
      rows: [
        ...rows.map((r) => [
          r.cycle,
          r.batch,
          r.status,
          String(r.students),
          String(r.inTraining),
          String(r.completed),
          String(r.notCompleted),
          pctText(r.rate),
          ...r.grades.map(String),
        ]),
        [
          'All batches',
          '',
          '',
          String(totals.students),
          String(totals.inTraining),
          String(totals.completed),
          String(totals.notCompleted),
          pctText(totalRate),
          ...totals.grades.map(String),
        ],
      ],
      notes: [
        'Completion rate = completed ÷ (completed + not completed). Grades count valid certificates.',
      ],
    }),
  };
}
