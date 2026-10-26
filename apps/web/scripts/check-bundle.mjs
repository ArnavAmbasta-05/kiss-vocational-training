// NFR-10 / BRQ-16.3: core student pages must load in under 500 KB (gzip) on a first visit, so
// they stay usable on 3G. Run after `vite build`: sums, per page, the app entry, the page's own
// chunk and everything they import statically, plus their CSS and the English locale files the
// page needs. Usage: node scripts/check-bundle.mjs   (exits 1 when a page is over budget)
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUDGET = 500 * 1024;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const manifestPath = join(dist, '.vite', 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error('dist/.vite/manifest.json not found: run `vite build` first.');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

/** Core student pages and the locale namespaces each one renders. */
const PAGES = {
  'src/pages/DashboardPage.tsx': ['common', 'dashboard', 'intervention', 'training', 'enrollment'],
  'src/features/catalogue/CataloguePage.tsx': ['common', 'courses'],
  'src/features/training/MyTrainingPage.tsx': ['common', 'training'],
  'src/features/passport/MyPassportPage.tsx': ['common', 'passport', 'competency'],
  'src/features/opportunities/MyOpportunitiesPage.tsx': ['common', 'opportunities', 'competency'],
  'src/features/competency/MySkillGapsPage.tsx': ['common', 'competency'],
};

const gz = (file) => gzipSync(readFileSync(join(dist, file)), { level: 9 }).length;

function closure(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  seen.add(key);
  for (const dep of manifest[key]?.imports ?? []) closure(dep, seen);
  return seen;
}

let failed = false;
for (const [page, namespaces] of Object.entries(PAGES)) {
  if (!manifest[page]) {
    console.error(`${page}: not in the manifest`);
    failed = true;
    continue;
  }
  const files = new Set();
  for (const key of new Set([...closure('index.html'), ...closure(page)])) {
    const entry = manifest[key];
    files.add(entry.file);
    for (const css of entry.css ?? []) files.add(css);
  }
  let bytes = [...files].reduce((sum, f) => sum + gz(f), 0);
  bytes += gzipSync(readFileSync(join(dist, 'index.html'))).length;
  for (const ns of namespaces) {
    const locale = Object.values(manifest).find((e) => e.src === `src/locales/en/${ns}.json`);
    if (locale) bytes += gz(locale.file);
  }
  const kb = (bytes / 1024).toFixed(1);
  const ok = bytes <= BUDGET;
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'OVER'} ${kb.padStart(6)} KB  ${page}`);
}
if (failed) {
  console.error(`A core page is over the ${BUDGET / 1024} KB first-load budget (NFR-10).`);
  process.exit(1);
}
