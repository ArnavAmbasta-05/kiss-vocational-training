import type { Passport } from '@vtmp/shared';
import { INK, MUTED, createPdf, drawTable, pageFooters, pdfDay, reportHeading } from './pdf';

/**
 * Skill Passport PDF (BRQ-10.1–10.2): verified competencies with level, date and verifying
 * trainer, practical and theory apart, then certificates. No marks or attendance (BR-15), so
 * the student can hand it to an employer.
 */
export async function renderPassport(
  p: Pick<Passport, 'student' | 'practical' | 'theory' | 'certificates'>,
  institution: string,
): Promise<Buffer> {
  const { doc, done, face } = createPdf({
    size: 'A4',
    margins: { top: 48, bottom: 56, left: 48, right: 48 },
    bufferPages: true,
    info: { Title: `Skill Passport — ${p.student.fullName}`, Author: institution },
  });
  reportHeading(
    doc,
    face,
    institution,
    'Skill Passport',
    `${p.student.fullName} (${p.student.rollNo})`,
  );

  const levels = ['', '1 Aware', '2 Assisted', '3 Independent', '4 Can teach others'];
  const section = (title: string, entries: Passport['practical']) => {
    doc.moveDown(0.4);
    doc.font('bold').fontSize(12).fillColor(INK).text(title, 48);
    doc.moveDown(0.2);
    if (entries.length === 0) {
      doc.font('regular').fontSize(10).fillColor(MUTED).text('None verified yet.', 48);
      return;
    }
    drawTable(
      doc,
      [
        { header: 'Competency', width: 5 },
        { header: 'Level', width: 2.2 },
        { header: 'Course', width: 3 },
        { header: 'Verified', width: 1.8 },
        { header: 'By', width: 2.4 },
      ],
      entries.map((e) => [
        e.title,
        levels[e.level] ?? String(e.level),
        e.courseTitle,
        pdfDay(e.verifiedAt),
        e.verifiedBy,
      ]),
      face,
    );
  };
  section('Practical skills', p.practical);
  section('Theory', p.theory);

  doc.moveDown(0.6);
  doc.font('bold').fontSize(12).fillColor(INK).text('Certificates', 48);
  doc.moveDown(0.2);
  const valid = p.certificates.filter((c) => c.status === 'VALID');
  if (valid.length === 0) {
    doc.font('regular').fontSize(10).fillColor(MUTED).text('No certificates yet.', 48);
  } else {
    drawTable(
      doc,
      [
        { header: 'Course', width: 5 },
        { header: 'Grade', width: 1.2, align: 'center' },
        { header: 'Issued', width: 2 },
        { header: 'Certificate ID (verify online)', width: 4 },
      ],
      valid.map((c) => [c.courseTitle, c.grade, pdfDay(c.issuedAt), c.publicCode]),
      face,
    );
  }
  pageFooters(doc, new Date());
  doc.end();
  return done;
}
