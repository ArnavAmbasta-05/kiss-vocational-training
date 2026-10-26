import path from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { Grade } from '@vtmp/shared';
import { fontsDir } from './pdf';

export interface CertificateContent {
  institution: string;
  studentName: string;
  /** Optional second line in Odia script (BRQ-16.2: the certificate stays in English). */
  nameOdia?: string | null;
  rollNo: string;
  courseTitle: string;
  batchName: string;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
  grade: Grade;
  aggregatePercent: number;
  attendancePercent: number;
  issuedAt: Date;
  publicCode: string;
  verifyUrl: string;
}

const ODIA = /[଀-୿]/;
const INK = '#0f172a';
const MUTED = '#475569';
const ACCENT = '#1d4ed8';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-10-23" → "23 Oct 2026" (dates on the certificate are calendar days, no time zone). */
function day(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * Certificate of completion (ADR-06): A4 landscape, Noto Sans (Noto Sans Oriya for Odia
 * names), and a QR code of the public verification URL beside the certificate ID.
 */
export async function renderCertificate(c: CertificateContent): Promise<Buffer> {
  const fonts = fontsDir();
  const qr = await QRCode.toBuffer(c.verifyUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
  });

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 0,
    info: {
      Title: `Certificate ${c.publicCode}`,
      Author: c.institution,
      Subject: `${c.courseTitle} — ${c.studentName}`,
    },
  });
  doc.registerFont('regular', path.join(fonts, 'noto-sans-latin-400-normal.woff'));
  doc.registerFont('bold', path.join(fonts, 'noto-sans-latin-700-normal.woff'));
  doc.registerFont('odia', path.join(fonts, 'noto-sans-oriya-oriya-400-normal.woff'));
  doc.registerFont('odia-bold', path.join(fonts, 'noto-sans-oriya-oriya-700-normal.woff'));
  const bold = (text: string) => (ODIA.test(text) ? 'odia-bold' : 'bold');

  const chunks: Buffer[] = [];
  doc.on('data', (b: Buffer) => chunks.push(b));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const W = doc.page.width;
  const H = doc.page.height;
  const centre = (text: string, y: number, font: string, size: number, color = INK) =>
    doc
      .font(font)
      .fontSize(size)
      .fillColor(color)
      .text(text, 60, y, { width: W - 120, align: 'center' });

  // Frame
  doc
    .lineWidth(3)
    .strokeColor(ACCENT)
    .rect(24, 24, W - 48, H - 48)
    .stroke();
  doc
    .lineWidth(0.75)
    .strokeColor(ACCENT)
    .rect(32, 32, W - 64, H - 64)
    .stroke();

  centre(c.institution, 62, 'bold', 18);
  centre('Vocational Training Programme', 88, 'regular', 12, MUTED);
  centre('Certificate of Completion', 128, 'bold', 32, ACCENT);

  centre('This is to certify that', 192, 'regular', 13, MUTED);
  centre(c.studentName, 214, bold(c.studentName), 28);
  // The optional Odia name sits under the English one and pushes the rest down a line.
  const odia = c.nameOdia?.trim() && ODIA.test(c.nameOdia) ? c.nameOdia.trim() : null;
  if (odia) centre(odia, 250, 'odia', 16);
  const dy = odia ? 24 : 0;
  centre(`Roll No. ${c.rollNo}`, 254 + dy, 'regular', 11, MUTED);
  centre(
    'has successfully completed the vocational training course',
    280 + dy,
    'regular',
    13,
    MUTED,
  );
  centre(c.courseTitle, 302 + dy, bold(c.courseTitle), 20);
  centre(
    `${c.batchName} · ${day(c.startDate)} to ${day(c.endDate)}`,
    334 + dy,
    'regular',
    12,
    MUTED,
  );
  centre(
    `Grade ${c.grade} · Aggregate ${c.aggregatePercent.toFixed(2)} % · Attendance ${c.attendancePercent.toFixed(2)} %`,
    362 + dy,
    'bold',
    13,
  );

  // Verification block (bottom left): QR, certificate ID, issue date.
  const qrSize = 92;
  const qrY = H - 60 - qrSize;
  doc.image(qr, 60, qrY, { width: qrSize, height: qrSize });
  doc
    .font('regular')
    .fontSize(9)
    .fillColor(MUTED)
    .text('Certificate ID', 162, qrY + 8);
  doc
    .font('bold')
    .fontSize(13)
    .fillColor(INK)
    .text(c.publicCode, 162, qrY + 20, { characterSpacing: 1 });
  doc
    .font('regular')
    .fontSize(9)
    .fillColor(MUTED)
    .text(`Issued ${day(c.issuedAt.toISOString().slice(0, 10))}`, 162, qrY + 42)
    .text(`Verify: ${c.verifyUrl}`, 162, qrY + 56, { width: 270 });

  // Signature lines (bottom right).
  const sigY = H - 92;
  // Right to left: Director at the far right, Course Trainer beside it.
  const sigW = 150;
  for (const [i, label] of ['Director, Vocational Training', 'Course Trainer'].entries()) {
    const x = W - 60 - sigW - i * (sigW + 30);
    doc
      .lineWidth(0.75)
      .strokeColor(INK)
      .moveTo(x, sigY)
      .lineTo(x + sigW, sigY)
      .stroke();
    doc
      .font('regular')
      .fontSize(10)
      .fillColor(MUTED)
      .text(label, x, sigY + 6, { width: sigW, align: 'center' });
  }

  doc.end();
  return done;
}
