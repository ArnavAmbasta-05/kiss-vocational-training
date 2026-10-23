import { renderStudentReport, renderTableReport } from '../../documents/reports.pdf';
import { toCsv } from '../csv';
import { completionRate } from '../rules';

describe('completionRate', () => {
  it('is null until someone finishes and ignores students still in training', () => {
    expect(completionRate(0, 0)).toBeNull();
    expect(completionRate(3, 1)).toBe(75);
    expect(completionRate(2, 1)).toBe(66.67);
    expect(completionRate(5, 0)).toBe(100);
    expect(completionRate(0, 4)).toBe(0);
  });
});

describe('toCsv', () => {
  it('quotes commas, quotes and newlines and starts with a BOM', () => {
    const csv = toCsv(
      ['Name', 'Note'],
      [
        ['Das, Rina', 'said "ok"\nthen left'],
        ['Ravi', null],
      ],
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('Name,Note\r\n"Das, Rina","said ""ok""\nthen left"\r\nRavi,\r\n');
  });

  it('defuses spreadsheet formulas (CSV injection)', () => {
    const csv = toCsv(['x'], [['=HYPERLINK("http://evil")'], ['+1'], ['-2'], ['@SUM(A1)'], [-3]]);
    const lines = csv.slice(1).trim().split('\r\n').slice(1);
    expect(lines).toEqual(['"\'=HYPERLINK(""http://evil"")"', "'+1", "'-2", "'@SUM(A1)", '-3']);
  });
});

describe('report PDFs', () => {
  it('renders a student report with results, evaluation and milestones', async () => {
    const pdf = await renderStudentReport({
      institution: 'Test Institute',
      generatedAt: new Date('2026-10-23T05:00:00Z'),
      student: { fullName: 'ସସ୍ମିତା Pradhan', rollNo: 'R-1' },
      course: {
        title: 'Domestic Electrician',
        batchName: 'Batch A',
        cycleName: 'Cycle 1',
        startDate: '2026-09-01',
        endDate: '2026-12-01',
      },
      status: 'In training',
      attendance: { attended: 9, conducted: 10, percent: 90, minimum: 75 },
      results: Array.from({ length: 30 }, (_, i) => ({
        title: `Assessment ${i + 1}`,
        mode: i % 2 ? 'THEORY' : 'PRACTICAL',
        heldOn: '2026-10-01',
        marks: i % 5 ? 40 : null,
        maxMarks: 50,
        weightage: 1,
        isMandatory: i < 3,
        remarks: i === 0 ? 'Neat wiring, careful with insulation' : null,
      })),
      aggregate: 80,
      grade: 'B',
      gradeIsFinal: false,
      evaluation: {
        recommended: true,
        remarks: 'Works safely.',
        evaluatedBy: 'Trainer One',
        evaluatedAt: '2026-10-20T00:00:00Z',
      },
      milestones: [{ milestone: 'Module 1 done', note: null, recordedAt: '2026-09-15T00:00:00Z' }],
      certificateCode: null,
    });
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    // 30 result rows force a second page; footers number every page.
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('renders a table report, including an empty one', async () => {
    const base = {
      institution: 'Test Institute',
      generatedAt: new Date(),
      title: 'Batch report',
      subtitle: 'Course · Batch',
      columns: [
        { header: 'Roll no', width: 1 },
        { header: 'Name', width: 2 },
      ],
    };
    const full = await renderTableReport({
      ...base,
      rows: [['R-1', 'Asha']],
      notes: ['1 student'],
    });
    const empty = await renderTableReport({ ...base, rows: [] });
    expect(full.subarray(0, 5).toString()).toBe('%PDF-');
    expect(empty.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
