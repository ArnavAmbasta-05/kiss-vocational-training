// Mirrors every key in src/locales/en into the other locales. Existing translations are kept,
// new keys are added as "" (shown in English until translated), and stale keys are dropped.
// Usage: node scripts/sync-locales.mjs [--check]   (--check exits 1 if anything is out of sync)
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'locales');
const source = 'en';
const targets = readdirSync(root).filter((d) => d !== source);
const check = process.argv.includes('--check');
let drift = false;

function mirror(en, existing) {
  if (typeof en === 'string') return typeof existing === 'string' ? existing : '';
  const out = {};
  for (const [key, value] of Object.entries(en)) {
    out[key] = mirror(value, existing && typeof existing === 'object' ? existing[key] : undefined);
  }
  return out;
}

for (const file of readdirSync(join(root, source)).filter((f) => f.endsWith('.json'))) {
  const en = JSON.parse(readFileSync(join(root, source, file), 'utf8'));
  for (const lng of targets) {
    const dir = join(root, lng);
    const path = join(dir, file);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const next =
      JSON.stringify(mirror(en, current ? JSON.parse(current) : undefined), null, 2) + '\n';
    if (current.replace(/\r\n/g, '\n') === next) continue;
    drift = true;
    if (check) {
      console.error(`out of sync: ${lng}/${file}`);
    } else {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path, next);
      console.log(`updated ${lng}/${file}`);
    }
  }
}

if (check && drift) {
  console.error('Run `pnpm --filter @vtmp/web i18n:sync` to fix.');
  process.exit(1);
}
