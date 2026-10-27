// k6 load test (NFR-03): 100 virtual users on the common pages and APIs, p95 under 2 s.
//
//   k6 run perf/load.js                                     (local: API on :4000, web on :4173)
//   API_URL=… WEB_URL=… PASSWORD=… k6 run perf/load.js       (another environment)
//   SMOKE=1 k6 run perf/load.js                             (5 users for 20 s: checks the script)
//
// Signs in once per role in setup() and shares the tokens, so the sign-in limiter (5 failures,
// 50 attempts per 15 minutes per IP) is never involved. Run it against a local or CI copy,
// not the live site: 100 users from one address would also trip its flood limiter.
import http from 'k6/http';
import { check, group, sleep } from 'k6';

const API = `${__ENV.API_URL || 'http://localhost:4000'}/api/v1`;
const WEB = __ENV.WEB_URL || 'http://localhost:4173';
const PASSWORD = __ENV.PASSWORD || 'Password@123';
const SMOKE = __ENV.SMOKE === '1';

export const options = {
  scenarios: {
    users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: SMOKE
        ? [{ duration: '20s', target: 5 }]
        : [
            { duration: '30s', target: 100 },
            { duration: '2m', target: 100 },
            { duration: '15s', target: 0 },
          ],
      exec: 'users',
    },
    // Public verification is limited to 30 requests a minute per IP (NFR-09); stay under it.
    verifiers: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1m',
      duration: SMOKE ? '20s' : '2m45s',
      preAllocatedVUs: 2,
      exec: 'verifiers',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    'http_req_duration{kind:api}': ['p(95)<2000'],
    'http_req_duration{kind:page}': ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

function signIn(email) {
  const res = http.post(`${API}/auth/login`, JSON.stringify({ email, password: PASSWORD }), {
    headers: { 'Content-Type': 'application/json' },
  });
  if (res.status !== 200) throw new Error(`sign-in failed for ${email}: ${res.status}`);
  return { Authorization: `Bearer ${res.json('accessToken')}` };
}

export function setup() {
  return {
    student: signIn('student001@kiss-vtmp.test'),
    trainer: signIn('trainer1@kiss-vtmp.test'),
    admin: signIn('admin@kiss-vtmp.test'),
  };
}

const ROUTES = {
  student: [
    '/dashboard/student',
    '/auth/me',
    '/notifications/me',
    '/students/me/training',
    '/students/me/gaps',
    '/students/me/passport',
    '/students/me/matches',
    '/courses',
  ],
  trainer: ['/dashboard/trainer', '/batches/mine', '/sessions/mine', '/risk-flags'],
  admin: ['/dashboard/admin', '/admin/users', '/audit-logs', '/analytics/outcomes'],
};

function getAll(headers, paths) {
  for (const p of paths) {
    const res = http.get(`${API}${p}`, { headers, tags: { kind: 'api', name: p } });
    check(res, { [`${p} 200`]: (r) => r.status === 200 });
  }
}

// Mostly students (as in the pilot), some trainers, few admins; each with think time.
export function users(tokens) {
  const roll = Math.random();
  const role = roll < 0.75 ? 'student' : roll < 0.95 ? 'trainer' : 'admin';
  group(role, () => {
    if (Math.random() < 0.3) {
      const page = http.get(`${WEB}/`, { tags: { kind: 'page', name: 'app shell' } });
      check(page, { 'app shell 200': (r) => r.status === 200 });
    }
    getAll(tokens[role], ROUTES[role]);
  });
  sleep(1 + Math.random() * 2);
}

export function verifiers() {
  const page = http.get(`${WEB}/verify`, { tags: { kind: 'page', name: '/verify' } });
  check(page, { 'verify page 200': (r) => r.status === 200 });
  // An unknown code still does the full lookup; 404 is the expected answer.
  const res = http.get(`${API}/public/verify/ZZZZZZZZZZZZZZZZ`, {
    tags: { kind: 'api', name: '/public/verify/:code' },
    responseCallback: http.expectedStatuses(404),
  });
  check(res, { 'verify lookup 404': (r) => r.status === 404 });
}
