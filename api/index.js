// Vercel serverless function: every /api/* and /health request is rewritten here (vercel.json)
// with its original URL intact, and the bundled Express app routes it.
// The bundle is produced by `pnpm --filter @vtmp/api build` in scripts/vercel-build.sh.
module.exports = require('../apps/api/dist/vercel.js').default;
