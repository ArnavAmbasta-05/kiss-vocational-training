/**
 * RFC 4180 CSV. Cells that a spreadsheet would run as a formula (=, +, -, @, tab, CR) get a
 * leading apostrophe so names or remarks can't inject formulas (CSV injection). A UTF-8 BOM
 * lets Excel open Odia and Hindi text correctly.
 */
export function toCsv(header: string[], rows: Array<Array<string | number | null>>): string {
  const cell = (v: string | number | null) => {
    if (v === null) return '';
    if (typeof v === 'number') return String(v);
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [header, ...rows].map((r) => r.map(cell).join(','));
  const BOM = String.fromCharCode(0xfeff);
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
