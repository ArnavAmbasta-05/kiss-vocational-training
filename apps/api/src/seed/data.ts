/** Deterministic demo data so every developer and CI run gets the same seed. */

// Override with SEED_PASSWORD when seeding a public demo database.
export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Password@123';
export const EMAIL_DOMAIN = 'kiss-vtmp.test';

export const ADMIN = { email: `admin@${EMAIL_DOMAIN}`, fullName: 'Portal Administrator' };

export const TRAINERS = [
  { n: 1, fullName: 'Sushant Mohanty', specialization: 'Electrical installation' },
  { n: 2, fullName: 'Priyanka Sahoo', specialization: 'Solar PV systems' },
  { n: 3, fullName: 'Ranjita Behera', specialization: 'Tailoring and garment making' },
  { n: 4, fullName: 'Debasis Nayak', specialization: 'Electrical maintenance' },
].map((t) => ({
  ...t,
  email: `trainer${t.n}@${EMAIL_DOMAIN}`,
  employeeCode: `TRN-${String(t.n).padStart(3, '0')}`,
}));

export const COURSES = [
  {
    code: 'ELEC-DOM',
    title: 'Electrician — Domestic',
    description:
      'Install, test and maintain household wiring, distribution boards and appliances safely.',
    durationWeeks: 12,
    prerequisites: 'Class 8 pass',
    seatCapacity: 40,
  },
  {
    code: 'SOLAR-PV',
    title: 'Solar PV Installer',
    description:
      'Survey sites, mount panels and wire grid-tied and off-grid solar photovoltaic systems.',
    durationWeeks: 10,
    prerequisites: 'Class 10 pass; basic electrical safety',
    seatCapacity: 30,
  },
  {
    code: 'TAIL-GMT',
    title: 'Tailoring & Garment Making',
    description:
      'Take measurements, draft patterns, cut and stitch garments on domestic and industrial machines.',
    durationWeeks: 12,
    prerequisites: null,
    seatCapacity: 35,
  },
] as const;

const FIRST_NAMES = [
  'Aarti',
  'Abhishek',
  'Anjali',
  'Bikash',
  'Chandan',
  'Deepa',
  'Gitanjali',
  'Jagannath',
  'Jyoti',
  'Kabita',
  'Laxmi',
  'Manas',
  'Mamata',
  'Niranjan',
  'Pooja',
  'Pradeep',
  'Rakesh',
  'Rashmi',
  'Sanjay',
  'Sasmita',
  'Subhash',
  'Sunita',
  'Tapan',
  'Upasana',
];
const LAST_NAMES = [
  'Majhi',
  'Hembram',
  'Soren',
  'Munda',
  'Oram',
  'Kisku',
  'Tudu',
  'Naik',
  'Pradhan',
  'Bhoi',
  'Gond',
  'Juang',
  'Kandha',
  'Saora',
];

/** Small linear congruential generator: same sequence on every run. */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

export interface SeedStudent {
  n: number;
  email: string;
  fullName: string;
  rollNo: string;
  cgpa: string;
  phone: string;
}

export function makeStudents(count: number): SeedStudent[] {
  const rand = lcg(2026);
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const first = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)]!;
    const last = LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)]!;
    // CGPA spread 5.00–9.80 so the CGPA priority rule has something to sort.
    const cgpa = (5 + Math.round(rand() * 480) / 100).toFixed(2);
    return {
      n,
      email: `student${String(n).padStart(3, '0')}@${EMAIL_DOMAIN}`,
      fullName: `${first} ${last}`,
      rollNo: `KISS-VT-${String(n).padStart(4, '0')}`,
      cgpa,
      phone: `9${String(437000000 + n * 7919).padStart(9, '0')}`,
    };
  });
}
