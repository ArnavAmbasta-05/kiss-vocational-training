// Builds docs/TRACEABILITY.md: every business requirement (BRQ-x.y) and rule (BR-nn) in
// docs/BRD.md with the modules that implement it, the endpoints that expose it and the tests
// that prove it. It reads the IDs the code already cites, so it stays true as the code changes.
//
//   node scripts/traceability.mjs           write the file
//   node scripts/traceability.mjs --check   fail if the file is out of date (CI)
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const posix = (p) => p.split(sep).join('/');

/**
 * Every ID a text cites, including the shorthand the code uses: ranges ("BRQ-14.1–14.3",
 * "BRQ-12.1--12.3", "BR-01–BR-04") and lists ("BRQ-2.1, 2.3").
 */
function idsIn(text) {
  const out = new Set();
  const BRQ =
    /\bBRQ-(\d+|C)\.(\d+)((?:\s*(?:,|\/|–|—|--|-|to)\s*(?:BRQ-)?(?:(?:\d+|C)\.)?\d+\b)*)/g;
  for (const m of text.matchAll(BRQ)) {
    let major = m[1];
    let last = Number(m[2]);
    out.add(`BRQ-${major}.${last}`);
    for (const t of m[3].matchAll(/(,|\/|–|—|--|-|to)\s*(?:BRQ-)?(?:(\d+|C)\.)?(\d+)/g)) {
      const [, sep, otherMajor, minor] = t;
      const n = Number(minor);
      if (otherMajor && otherMajor !== major) {
        // "BRQ-13.1, BRQ-C.3": another group starts here.
        major = otherMajor;
        last = n;
        out.add(`BRQ-${major}.${n}`);
        continue;
      }
      if (sep === ',' || sep === '/') out.add(`BRQ-${major}.${n}`);
      else for (let k = last + 1; k <= n && k - last < 20; k++) out.add(`BRQ-${major}.${k}`);
      last = n;
    }
  }
  for (const m of text.matchAll(/\bBR-(\d{2})(?:\s*(?:–|—|--)\s*(?:BR-)?(\d{2})\b)?/g)) {
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    for (let k = from; k <= to && k - from < 25; k++) out.add(`BR-${String(k).padStart(2, '0')}`);
  }
  return [...out];
}

function files(dir, keep) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    const p = join(dir, name);
    if (statSync(join(root, p)).isDirectory()) out.push(...files(p, keep));
    else if (keep(posix(p))) out.push(posix(p));
  }
  return out;
}

// ─── Requirements from the BRD ────────────────────────────────────────────────

/**
 * The BRD's pandoc tables: a line of dash groups gives the columns, a header row names them,
 * and blank lines separate rows whose cells wrap over several lines.
 */
function tables(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*-+( +-+)+\s*$/.test(lines[i])) continue;
    const spans = [...lines[i].matchAll(/-+/g)].map((m) => [m.index, m.index + m[0].length]);
    const slice = (line, [a, b], last) => line.slice(a, last ? undefined : b + 1).trim();
    const cells = (block) =>
      spans.map((span, c) =>
        block
          .map((l) => slice(l, span, c === spans.length - 1))
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' '),
      );
    // Header: the lines between the top border and this line.
    let h = i - 1;
    while (h > 0 && lines[h].trim() && !/^\s*-+\s*$/.test(lines[h])) h--;
    const header = cells(lines.slice(h + 1, i));
    const rows = [];
    let block = [];
    let j = i + 1;
    for (; j < lines.length && !/^\s*-{10,}\s*$/.test(lines[j]); j++) {
      if (lines[j].trim()) {
        block.push(lines[j]);
      } else if (block.length) {
        rows.push(cells(block));
        block = [];
      }
    }
    if (block.length) rows.push(cells(block));
    out.push({ header, rows });
    i = j;
  }
  return out;
}

const tidy = (text) => {
  const t = text
    .replace(/\\(["'])/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/[.;,]\s*$/, '')
    .trim();
  return t.length > 110 ? `${t.slice(0, 107).trimEnd()}…` : t;
};

/** Every BRQ and BR the BRD defines, with its text, in document-independent order. */
function requirements() {
  const found = new Map();
  for (const { header, rows } of tables(read('docs/BRD.md').split(/\r?\n/))) {
    const descCol = header.findIndex((hd) => /requirement|^rule/i.test(hd));
    for (const row of rows) {
      const key = /^(BRQ-(?:\d+|C)\.\d+|BR-\d{2})$/.exec(row[0] ?? '')?.[1];
      if (key && descCol > 0) {
        if (!found.has(key)) found.set(key, tidy(row[descCol] ?? ''));
        continue;
      }
      // Release 3 tables list several requirements inside one cell: "BRQ-13.1 Admin … BRQ-13.2 …".
      for (const cell of row) {
        const parts = cell.split(/(?=\bBRQ-\d+\.\d+ )/);
        for (const part of parts) {
          const m = /^(BRQ-\d+\.\d+) (.*)$/.exec(part.trim());
          if (m && !found.has(m[1])) found.set(m[1], tidy(m[2]));
        }
      }
    }
  }
  const order = (id) =>
    id.startsWith('BRQ-')
      ? id
          .slice(4)
          .split('.')
          .map((x) => (x === 'C' ? 12.5 : Number(x)))
      : [1000 + Number(id.slice(3)), 0];
  return [...found.entries()].sort((a, b) => {
    const [x, y] = [order(a[0]), order(b[0])];
    return x[0] - y[0] || x[1] - y[1];
  });
}

// ─── Where the code cites them ────────────────────────────────────────────────

const addTo = (map, id, value) => {
  if (!map.has(id)) map.set(id, new Set());
  map.get(id).add(value);
};

/** Modules (or web features) whose non-test source mentions each ID. */
function modules() {
  const map = new Map();
  const source = [
    ...files('apps/api/src', (p) => p.endsWith('.ts') && !p.includes('__tests__')),
    ...files('apps/web/src', (p) => /\.tsx?$/.test(p)),
  ];
  for (const f of source) {
    const where =
      /apps\/api\/src\/modules\/([\w-]+)\//.exec(f)?.[1] ??
      (/apps\/api\/src\/core\/(\w+)\//.exec(f) ? `core/${/core\/(\w+)/.exec(f)[1]}` : null) ??
      (/apps\/web\/src\/features\/([\w-]+)\//.exec(f)
        ? `web:${/features\/([\w-]+)/.exec(f)[1]}`
        : null);
    if (!where) continue;
    for (const id of idsIn(read(f))) addTo(map, id, where);
  }
  return map;
}

/** Endpoints whose openapi.yaml entry mentions each ID. */
function endpoints() {
  const map = new Map();
  let path = null;
  let method = null;
  for (const line of read('apps/api/openapi.yaml').split(/\r?\n/)) {
    const p = /^ {2}(\/\S*):\s*$/.exec(line);
    if (p) {
      path = p[1];
      method = null;
      continue;
    }
    if (/^\S/.test(line)) path = null;
    const m = /^ {4}(get|post|put|patch|delete):\s*$/.exec(line);
    if (m) method = m[1].toUpperCase();
    if (!path || !method) continue;
    for (const id of idsIn(line)) addTo(map, id, `${method} /api/v1${path}`);
  }
  return map;
}

/**
 * Tests that cite each ID: in their own title, in their body, or in an enclosing describe
 * title. Names read "file › describe › test".
 */
function tests() {
  const map = new Map();
  const all = [
    ...files('apps/api/src', (p) => /__tests__\/.*\.test\.ts$/.test(p)),
    ...files('apps/web/e2e', (p) => p.endsWith('.spec.ts')),
  ];
  const TITLE = /\b(describe|it|test)(?:\.\w+)?\(\s*(['"`])((?:\\.|(?!\2).)*)\2/g;
  for (const f of all) {
    const text = read(f);
    const short = f.replace(/^apps\/api\/src\//, 'api/').replace(/^apps\/web\/e2e\//, 'e2e/');
    const marks = [...text.matchAll(TITLE)].map((m) => ({
      kind: m[1] === 'describe' ? 'describe' : 'test',
      title: m[3],
      at: m.index,
      depth: text.slice(0, m.index).split('\n').pop().length,
    }));
    const tests = marks.filter((m) => m.kind === 'test');
    tests.forEach((t, i) => {
      const end = tests[i + 1]?.at ?? text.length;
      const outer = marks.filter((m) => m.kind === 'describe' && m.at < t.at && m.depth < t.depth);
      const describe = outer.at(-1);
      const name = `${short} › ${describe ? `${describe.title} › ` : ''}${t.title}`;
      const ids = new Set([
        ...idsIn(text.slice(t.at, end)),
        ...outer.flatMap((d) => idsIn(d.title)),
      ]);
      for (const id of ids) addTo(map, id, name);
    });
  }
  return map;
}

// ─── Output ───────────────────────────────────────────────────────────────────

const reqs = requirements();
/** Automated checks other than tests (CI budgets, workflows) that cite an ID. */
function checks(into) {
  const all = [
    ...files('apps/web/scripts', (p) => p.endsWith('.mjs')),
    ...files('perf', (p) => /\.(m?js)$/.test(p)),
    ...files('.github/workflows', (p) => p.endsWith('.yml')),
  ];
  for (const f of all) for (const id of idsIn(read(f))) addTo(into, id, `check: ${f}`);
  return into;
}

const [mods, eps, tsts] = [modules(), endpoints(), checks(tests())];
const cell = (set, max = 3) => {
  if (!set?.size) return '—';
  const list = [...set].sort();
  const shown = list.slice(0, max).map((x) => `\`${x}\``);
  return list.length > max
    ? `${shown.join('<br>')}<br>+${list.length - max} more`
    : shown.join('<br>');
};

const covered = reqs.filter(([id]) => tsts.get(id)?.size);
const gaps = reqs.filter(([id]) => !tsts.get(id)?.size);
const section = (title, rows) => [
  `## ${title}`,
  '',
  '| ID | Requirement | Modules | Endpoints | Tests |',
  '| --- | --- | --- | --- | --- |',
  ...rows.map(
    ([id, text]) =>
      `| ${id} | ${text.replace(/\|/g, '\\|')} | ${cell(mods.get(id), 4)} | ${cell(eps.get(id))} | ${cell(tsts.get(id))} |`,
  ),
  '',
];

const out = [
  '# Traceability',
  '',
  '<!-- Generated by `node scripts/traceability.mjs`. Do not edit by hand. -->',
  '',
  'Every business requirement (BRQ) and business rule (BR) in [BRD.md](BRD.md), with the',
  'modules that implement it, the endpoints in `apps/api/openapi.yaml` that expose it and the',
  'tests that prove it. Built from the IDs the code, the API description and the tests cite,',
  'so it changes when they do. Test names read `file › describe › test`; `api/` tests run with',
  'Jest (unit and integration against PostgreSQL), `e2e/` tests with Playwright in a browser.',
  '',
  `**Coverage:** ${covered.length} of ${reqs.length} IDs are cited by at least one test or automated check.` +
    (gaps.length ? ` Not cited by any: ${gaps.map(([id]) => id).join(', ')}.` : ''),
  '',
  ...section(
    'Business requirements',
    reqs.filter(([id]) => id.startsWith('BRQ-')),
  ),
  ...section(
    'Business rules',
    reqs.filter(([id]) => id.startsWith('BR-')),
  ),
].join('\n');

const target = 'docs/TRACEABILITY.md';
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = read(target);
  } catch {
    // missing counts as out of date
  }
  if (current !== out) {
    console.error(`${target} is out of date: run node scripts/traceability.mjs`);
    process.exit(1);
  }
  console.log(
    `${target} is up to date (${covered.length}/${reqs.length} cited by tests or checks).`,
  );
} else {
  writeFileSync(join(root, target), out);
  console.log(
    `wrote ${relative(root, join(root, target))}: ${covered.length}/${reqs.length} cited by tests or checks`,
  );
  if (gaps.length)
    console.log(`not cited by any test or check: ${gaps.map(([id]) => id).join(', ')}`);
}
