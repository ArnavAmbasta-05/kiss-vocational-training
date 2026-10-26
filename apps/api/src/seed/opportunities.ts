import type { OpportunityType, PrismaClient } from '@prisma/client';
import { audit } from '../core/audit';
import { ADMIN } from './data';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Job roles built from the seeded competency codes (BRQ-C.3). */
const ROLES: Array<{ title: string; description: string; competencies: Array<[string, number]> }> =
  [
    {
      title: 'Domestic electrician (helper)',
      description: 'Wires and tests houses under a licensed electrician.',
      competencies: [
        ['E01', 3],
        ['E02', 3],
        ['E04', 3],
        ['E05', 3],
        ['E06', 2],
      ],
    },
    {
      title: 'Solar PV installation technician',
      description: 'Installs and commissions rooftop solar systems.',
      competencies: [
        ['S01', 3],
        ['S03', 3],
        ['S04', 3],
        ['S05', 2],
        ['S08', 2],
      ],
    },
    {
      title: 'Garment machine operator',
      description: 'Cuts and stitches garments to specification in a production unit.',
      competencies: [
        ['T01', 3],
        ['T02', 3],
        ['T03', 2],
      ],
    },
  ];

/** Sample opportunities from partners (BRD §14: provided by the placement cell later). */
const OPPORTUNITIES: Array<{
  role: string;
  title: string;
  type: OpportunityType;
  partner: string;
  location: string;
  closesInDays: number;
}> = [
  {
    role: 'Domestic electrician (helper)',
    title: 'Apprentice electrician',
    type: 'APPRENTICESHIP',
    partner: 'Bhubaneswar Electrical Contractors (demo)',
    location: 'Bhubaneswar',
    closesInDays: 45,
  },
  {
    role: 'Solar PV installation technician',
    title: 'Rooftop solar installer',
    type: 'JOB',
    partner: 'Odisha Rooftop Solar (demo)',
    location: 'Cuttack',
    closesInDays: 30,
  },
  {
    role: 'Solar PV installation technician',
    title: 'Solar maintenance internship',
    type: 'INTERNSHIP',
    partner: 'Green Grid Services (demo)',
    location: 'Bhubaneswar',
    closesInDays: 60,
  },
  {
    role: 'Garment machine operator',
    title: 'Sewing machine operator',
    type: 'JOB',
    partner: 'Kalinga Garments (demo)',
    location: 'Khurda',
    closesInDays: 40,
  },
];

/**
 * F13 demo data: three job roles and four opportunities. Idempotent: existing roles (by title)
 * and opportunities (by title and partner) are left alone. Each new row gets an audit entry.
 */
export async function seedOpportunities(prisma: PrismaClient, log: (m: string) => void) {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN.email } });
  let roles = 0;
  let opps = 0;
  for (const r of ROLES) {
    const exists = await prisma.jobRole.findUnique({ where: { title: r.title } });
    if (exists) continue;
    await prisma.$transaction(async (tx) => {
      const role = await tx.jobRole.create({
        data: {
          title: r.title,
          description: r.description,
          competencies: {
            create: r.competencies.map(([competencyCode, level]) => ({ competencyCode, level })),
          },
        },
      });
      await audit.record(tx, {
        userId: null,
        action: 'JOB_ROLE_CREATED',
        entity: 'JobRole',
        entityId: role.id,
        newValue: { title: r.title, by: 'seed' },
      });
    });
    roles++;
  }
  for (const o of OPPORTUNITIES) {
    const role = await prisma.jobRole.findUniqueOrThrow({ where: { title: o.role } });
    const exists = await prisma.opportunity.findFirst({
      where: { title: o.title, partner: o.partner },
    });
    if (exists) continue;
    await prisma.$transaction(async (tx) => {
      const created = await tx.opportunity.create({
        data: {
          roleId: role.id,
          title: o.title,
          type: o.type,
          partner: o.partner,
          location: o.location,
          closesOn: new Date(Date.now() + o.closesInDays * DAY_MS),
          createdById: admin.id,
        },
      });
      await audit.record(tx, {
        userId: null,
        action: 'OPPORTUNITY_CREATED',
        entity: 'Opportunity',
        entityId: created.id,
        newValue: { title: o.title, partner: o.partner, by: 'seed' },
      });
    });
    opps++;
  }
  log(`opportunities: ${roles} job roles and ${opps} opportunities added`);
}
