import type { Grade } from '@vtmp/shared';
import {
  INK,
  MUTED,
  createPdf,
  drawTable,
  pageFooters,
  pdfDay,
  reportHeading,
  type TableColumn,
} from './pdf';

export interface StudentReportContent {
  institution: string;
  generatedAt: Date;
  student: { fullName: string; rollNo: string };
  course: {
    title: string;
    batchName: string;
    cycleName: string;
    startDate: string;
    endDate: string;
  };
  status: string;
  attendance: { attended: number; conducted: number; percent: number | null; minimum: number };
  results: Array<{
    title: string;
    mode: string;
    heldOn: string | null;
    marks: number | null;
    maxMarks: number;
    weightage: number;
    isMandatory: boolean;
    remarks: string | null;
  }>;
  aggregate: number | null;
  grade: Grade | null;
  /** True when the grade is the certified snapshot rather than a projection. */
  gradeIsFinal: boolean;
  evaluation: {
    recommended: boolean;
    remarks: string;
    evaluatedBy: string;
    evaluatedAt: string;
  } | null;
  milestones: Array<{ milestone: string; note: string | null; recordedAt: string }>;
  certificateCode: string | null;
}

const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(2)} %`);
const GRADE_TEXT: Record<Grade, string> = {
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  NOT_COMPLETED: 'Not completed',
};

/** BRQ-8.1: student performance report (BRD §12.2), A4 portrait, English (TAD §15). */
export async function renderStudentReport(c: StudentReportContent): Promise<Buffer> {
  const { doc, done, face } = createPdf({
    size: 'A4',
    margins: { top: 48, bottom: 56, left: 48, right: 48 },
    bufferPages: true,
    info: { Title: `Performance report — ${c.student.fullName}`, Author: c.institution },
  });
  const width = doc.page.width - 96;

  reportHeading(
    doc,
    face,
    c.institution,
    'Student performance report',
    `${c.course.title} · ${c.course.batchName} · ${c.course.cycleName}`,
  );

  const facts: Array<[string, string]> = [
    ['Student', `${c.student.fullName} (${c.student.rollNo})`],
    ['Training', `${pdfDay(c.course.startDate)} to ${pdfDay(c.course.endDate)}`],
    ['Status', c.status + (c.certificateCode ? ` · certificate ${c.certificateCode}` : '')],
    [
      'Attendance',
      `${pct(c.attendance.percent)} (${c.attendance.attended} of ${c.attendance.conducted} sessions; minimum ${c.attendance.minimum} %)`,
    ],
    ['Aggregate', pct(c.aggregate)],
    [c.gradeIsFinal ? 'Grade' : 'Projected grade', c.grade ? GRADE_TEXT[c.grade] : '—'],
  ];
  for (const [label, value] of facts) {
    const y = doc.y;
    doc.font('bold').fontSize(10).fillColor(MUTED).text(label, 48, y, { width: 110 });
    doc
      .font(face(value))
      .fontSize(10)
      .fillColor(INK)
      .text(value, 160, y, { width: width - 112 });
    doc.moveDown(0.3);
  }

  doc.moveDown(0.6);
  doc.font('bold').fontSize(12).fillColor(INK).text('Assessment results', 48);
  doc.moveDown(0.3);
  const columns: TableColumn[] = [
    { header: 'Assessment', width: 4 },
    { header: 'Type', width: 1.6 },
    { header: 'Held on', width: 1.8 },
    { header: 'Marks', width: 1.6, align: 'right' },
    { header: 'Weight', width: 1.1, align: 'right' },
    { header: 'Remarks', width: 4 },
  ];
  drawTable(
    doc,
    columns,
    c.results.length
      ? c.results.map((r) => [
          r.title + (r.isMandatory ? ' *' : ''),
          r.mode === 'PRACTICAL' ? 'Practical' : 'Theory',
          r.heldOn ? pdfDay(r.heldOn) : '—',
          r.marks === null ? 'Not recorded' : `${r.marks} / ${r.maxMarks}`,
          String(r.weightage),
          r.remarks ?? '',
        ])
      : [['No assessments yet', '', '', '', '', '']],
    face,
  );
  doc.font('regular').fontSize(8).fillColor(MUTED).text('* mandatory for completion', 48);

  doc.moveDown(0.8);
  doc.font('bold').fontSize(12).fillColor(INK).text("Trainer's evaluation", 48);
  doc.moveDown(0.2);
  if (c.evaluation) {
    doc
      .font('bold')
      .fontSize(10)
      .fillColor(INK)
      .text(
        c.evaluation.recommended ? 'Recommended for completion' : 'Not recommended for completion',
      );
    doc.font(face(c.evaluation.remarks)).fontSize(10).text(c.evaluation.remarks, { width });
    doc
      .font('regular')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(`${c.evaluation.evaluatedBy}, ${pdfDay(c.evaluation.evaluatedAt)}`);
  } else {
    doc.font('regular').fontSize(10).fillColor(MUTED).text('Not evaluated yet.');
  }

  if (c.milestones.length) {
    doc.moveDown(0.8);
    doc.font('bold').fontSize(12).fillColor(INK).text('Progress milestones', 48);
    doc.moveDown(0.2);
    for (const m of c.milestones) {
      doc
        .font(face(m.milestone, 'bold'))
        .fontSize(10)
        .fillColor(INK)
        .text(`${pdfDay(m.recordedAt)} — ${m.milestone}`, { width });
      if (m.note) doc.font(face(m.note)).fontSize(9.5).fillColor(MUTED).text(m.note, { width });
      doc.moveDown(0.2);
    }
  }

  pageFooters(doc, c.generatedAt);
  doc.end();
  return done;
}

export interface TableReportContent {
  institution: string;
  generatedAt: Date;
  title: string;
  subtitle: string;
  columns: TableColumn[];
  rows: string[][];
  /** Lines printed under the table (totals, notes). */
  notes?: string[];
}

/** BRQ-8.2: batch and course reports as a landscape table. */
export async function renderTableReport(c: TableReportContent): Promise<Buffer> {
  const { doc, done, face } = createPdf({
    size: 'A4',
    layout: 'landscape',
    margins: { top: 40, bottom: 48, left: 40, right: 40 },
    bufferPages: true,
    info: { Title: `${c.title} — ${c.subtitle}`, Author: c.institution },
  });
  reportHeading(doc, face, c.institution, c.title, c.subtitle);
  drawTable(
    doc,
    c.columns,
    c.rows.length ? c.rows : [c.columns.map((_, i) => (i ? '' : 'No rows'))],
    face,
  );
  if (c.notes?.length) {
    doc.moveDown(0.6);
    for (const n of c.notes) doc.font(face(n)).fontSize(9.5).fillColor(INK).text(n, 40);
  }
  pageFooters(doc, c.generatedAt);
  doc.end();
  return done;
}
