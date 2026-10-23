import { PUBLIC_CODE_LENGTH, PUBLIC_CODE_PATTERN, publicCode } from '../code';
import { renderCertificate } from '../certificate.pdf';

describe('certificate public code (BR-10, BR-19)', () => {
  it('is 16 Crockford base32 characters (at least 12)', () => {
    const code = publicCode();
    expect(code).toHaveLength(PUBLIC_CODE_LENGTH);
    expect(PUBLIC_CODE_LENGTH).toBeGreaterThanOrEqual(12);
    expect(code).toMatch(PUBLIC_CODE_PATTERN);
    expect(code).not.toMatch(/[ILOU]/);
  });

  it('is random: 20 000 codes are all different and not sequential', () => {
    const codes = Array.from({ length: 20_000 }, publicCode);
    expect(new Set(codes).size).toBe(codes.length);
    const sorted = [...codes].sort();
    expect(sorted).not.toEqual(codes);
  });

  it('uses every symbol of the alphabet (no stuck bits)', () => {
    const seen = new Set(Array.from({ length: 2_000 }, publicCode).join(''));
    expect(seen.size).toBe(32);
  });
});

describe('certificate PDF (ADR-06)', () => {
  it('renders a complete A4 landscape PDF with embedded fonts', async () => {
    const pdf = await renderCertificate({
      institution: 'Test Institute',
      studentName: 'ସସ୍ମିତା Pradhan',
      rollNo: 'R-1',
      courseTitle: 'Domestic Electrician',
      batchName: 'Batch A',
      startDate: '2026-01-05',
      endDate: '2026-03-27',
      grade: 'B',
      aggregatePercent: 72.5,
      attendancePercent: 88,
      issuedAt: new Date('2026-04-01T10:00:00Z'),
      publicCode: 'ABCDEFGHJKMNPQRS',
      verifyUrl: 'https://example.test/verify/ABCDEFGHJKMNPQRS',
    });
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('/MediaBox [0 0 841.89 595.28]');
    expect(text).toContain('/FontFile2');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf.length).toBeGreaterThan(5_000);
  });
});
