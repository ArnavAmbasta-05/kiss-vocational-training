// Fails when a Lighthouse report (mobile, simulated slow 4G) misses its budget.
//   node perf/lighthouse-check.mjs <report.json> <max LCP ms> <max total KB>
// NFR-09: /verify fully loads in under 3 s on a throttled phone. NFR-10: core pages stay
// small (the per-page JavaScript budget itself is scripts/check-bundle.mjs).
import { readFileSync } from 'node:fs';

const [file, maxLcp, maxKb] = process.argv.slice(2);
if (!file || !maxLcp || !maxKb) {
  console.error('usage: node perf/lighthouse-check.mjs <report.json> <max LCP ms> <max total KB>');
  process.exit(2);
}
const report = JSON.parse(readFileSync(file, 'utf8'));
const lcp = report.audits['largest-contentful-paint'].numericValue;
const kb = report.audits['total-byte-weight'].numericValue / 1024;
const score = Math.round(report.categories.performance.score * 100);
const ok = lcp <= Number(maxLcp) && kb <= Number(maxKb);
console.log(
  `${ok ? 'ok  ' : 'FAIL'} ${report.finalDisplayedUrl}: LCP ${Math.round(lcp)} ms ` +
    `(max ${maxLcp}), ${Math.round(kb)} KB (max ${maxKb}), performance ${score}`,
);
process.exit(ok ? 0 : 1);
