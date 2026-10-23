import type { AssessmentMode, LearningResourceType, PrismaClient } from '@prisma/client';
import { audit } from '../core/audit';
import { ADMIN, TRAINERS } from './data';
import { PILOT_BATCH, PILOT_CYCLE } from './training';

interface SeedCompetency {
  code: string;
  title: string;
  mode: AssessmentMode;
  requiredLevel: number;
  isMandatory: boolean;
  /** Titles of pilot-batch assessments that evidence it (Electrician only). */
  evidence?: string[];
  /** Curated reading or practice page (in addition to a video search). */
  reading?: { title: string; url: string; type?: LearningResourceType };
}

/**
 * Seeding a remote database (Neon, Singapore) from a laptop makes every query a round trip, so
 * Prisma's default 5 s per transaction is too short. Generous, but still bounded.
 */
const SEED_TX = { timeout: 60_000, maxWait: 20_000 };

const wiki = (page: string) => `https://en.wikipedia.org/wiki/${page}`;
const video = (q: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

/** 10 competencies per demo course (BRD §9.1). Required levels: 1 Aware … 4 Can teach others. */
export const COMPETENCIES: Record<string, SeedCompetency[]> = {
  'ELEC-DOM': [
    {
      code: 'E01',
      title: 'Follow electrical safety and isolation procedures',
      mode: 'THEORY',
      requiredLevel: 3,
      isMandatory: true,
      evidence: ['Safety and tools quiz'],
      reading: { title: 'Electrical safety at work', url: wiki('Electrical_safety') },
    },
    {
      code: 'E02',
      title: 'Use hand tools and a multimeter correctly',
      mode: 'PRACTICAL',
      requiredLevel: 3,
      isMandatory: true,
      evidence: ['Safety and tools quiz'],
      reading: { title: 'How a multimeter works', url: wiki('Multimeter') },
    },
    {
      code: 'E03',
      title: 'Read wiring diagrams and electrical symbols',
      mode: 'THEORY',
      requiredLevel: 2,
      isMandatory: false,
      reading: { title: 'Circuit diagrams', url: wiki('Circuit_diagram') },
    },
    {
      code: 'E04',
      title: 'Wire a single-phase distribution board',
      mode: 'PRACTICAL',
      requiredLevel: 3,
      isMandatory: true,
      evidence: ['House wiring practical'],
      reading: { title: 'Distribution boards explained', url: wiki('Distribution_board') },
    },
    {
      code: 'E05',
      title: 'Install switches, sockets and lighting circuits',
      mode: 'PRACTICAL',
      requiredLevel: 3,
      isMandatory: true,
      evidence: ['House wiring practical'],
      reading: {
        title: 'Practice: wire a two-way lighting circuit on the training board',
        url: wiki('Multiway_switching'),
        type: 'PRACTICE_TASK',
      },
    },
    {
      code: 'E06',
      title: 'Test earthing resistance',
      mode: 'PRACTICAL',
      requiredLevel: 3,
      isMandatory: true,
      evidence: ['House wiring practical'],
      reading: { title: 'Earthing systems', url: wiki('Earthing_system') },
    },
    {
      code: 'E07',
      title: 'Test insulation resistance with a megger',
      mode: 'PRACTICAL',
      requiredLevel: 2,
      isMandatory: false,
      reading: { title: 'Megohmmeter basics', url: wiki('Megohmmeter') },
    },
    {
      code: 'E08',
      title: 'Size cables and protective devices for a load',
      mode: 'THEORY',
      requiredLevel: 3,
      isMandatory: true,
      evidence: ['Final theory paper'],
      reading: { title: 'Circuit breakers and their ratings', url: wiki('Circuit_breaker') },
    },
    {
      code: 'E09',
      title: 'Install and test an RCD / RCCB',
      mode: 'PRACTICAL',
      requiredLevel: 3,
      isMandatory: false,
      reading: { title: 'Residual-current devices', url: wiki('Residual-current_device') },
    },
    {
      code: 'E10',
      title: 'Estimate materials and cost for a house wiring job',
      mode: 'THEORY',
      requiredLevel: 2,
      isMandatory: false,
      evidence: ['Final theory paper'],
      reading: {
        title: 'Remedial session: estimating a wiring job',
        url: wiki('Cost_estimate'),
        type: 'REMEDIAL_SESSION',
      },
    },
  ],
  'SOLAR-PV': [
    {
      code: 'S01',
      title: 'Work safely at height and with DC circuits',
      mode: 'THEORY',
      requiredLevel: 3,
      isMandatory: true,
      reading: { title: 'Fall protection', url: wiki('Fall_protection') },
    },
    {
      code: 'S02',
      title: 'Assess a roof for shading and orientation',
      mode: 'PRACTICAL',
      requiredLevel: 2,
      isMandatory: false,
      reading: { title: 'Solar irradiance', url: wiki('Solar_irradiance') },
    },
    {
      code: 'S03',
      title: 'Mount and align PV modules',
      mode: 'PRACTICAL',
      requiredLevel: 3,
      isMandatory: true,
      reading: {
        title: 'Photovoltaic mounting systems',
        url: wiki('Photovoltaic_mounting_system'),
      },
    },
    {
      code: 'S04',
      title: 'Wire modules in series and parallel strings',
      mode: 'PRACTICAL',
      requiredLevel: 3,
      isMandatory: true,
      reading: { title: 'Photovoltaic systems', url: wiki('Photovoltaic_system') },
    },
    {
      code: 'S05',
      title: 'Install and configure a solar inverter',
      mode: 'PRACTICAL',
      requiredLevel: 3,
      isMandatory: true,
      reading: { title: 'Solar inverters', url: wiki('Solar_inverter') },
    },
    {
      code: 'S06',
      title: 'Install a charge controller and battery bank',
      mode: 'PRACTICAL',
      requiredLevel: 2,
      isMandatory: false,
      reading: { title: 'Charge controllers', url: wiki('Charge_controller') },
    },
    {
      code: 'S07',
      title: 'Earth and protect a PV system',
      mode: 'PRACTICAL',
      requiredLevel: 3,
      isMandatory: true,
      reading: { title: 'Earthing systems', url: wiki('Earthing_system') },
    },
    {
      code: 'S08',
      title: 'Commission and test a rooftop system',
      mode: 'PRACTICAL',
      requiredLevel: 3,
      isMandatory: false,
    },
    {
      code: 'S09',
      title: 'Clean and maintain panels',
      mode: 'PRACTICAL',
      requiredLevel: 2,
      isMandatory: false,
    },
    {
      code: 'S10',
      title: 'Explain net metering to a customer',
      mode: 'THEORY',
      requiredLevel: 2,
      isMandatory: false,
      reading: { title: 'Net metering', url: wiki('Net_metering') },
    },
  ],
  'TAIL-GMT': [
    {
      code: 'T01',
      title: 'Take body measurements accurately',
      mode: 'PRACTICAL',
      requiredLevel: 3,
      isMandatory: true,
    },
    {
      code: 'T02',
      title: 'Draft basic patterns from measurements',
      mode: 'PRACTICAL',
      requiredLevel: 3,
      isMandatory: true,
      reading: { title: 'Pattern making', url: wiki('Pattern_(sewing)') },
    },
    {
      code: 'T03',
      title: 'Lay out and cut fabric economically',
      mode: 'PRACTICAL',
      requiredLevel: 3,
      isMandatory: true,
    },
    {
      code: 'T04',
      title: 'Operate and maintain a sewing machine',
      mode: 'PRACTICAL',
      requiredLevel: 3,
      isMandatory: true,
      reading: { title: 'Sewing machines', url: wiki('Sewing_machine') },
    },
    {
      code: 'T05',
      title: 'Sew common seams and finishes',
      mode: 'PRACTICAL',
      requiredLevel: 3,
      isMandatory: true,
      reading: { title: 'Seams', url: wiki('Seam_(sewing)') },
    },
    {
      code: 'T06',
      title: 'Attach collars, sleeves and cuffs',
      mode: 'PRACTICAL',
      requiredLevel: 2,
      isMandatory: false,
    },
    {
      code: 'T07',
      title: 'Insert zips and make buttonholes',
      mode: 'PRACTICAL',
      requiredLevel: 2,
      isMandatory: false,
      reading: { title: 'Buttonholes', url: wiki('Buttonhole') },
    },
    {
      code: 'T08',
      title: 'Identify fabrics and their care',
      mode: 'THEORY',
      requiredLevel: 2,
      isMandatory: false,
      reading: { title: 'Textiles', url: wiki('Textile') },
    },
    {
      code: 'T09',
      title: 'Check garment fit and make alterations',
      mode: 'PRACTICAL',
      requiredLevel: 3,
      isMandatory: false,
    },
    {
      code: 'T10',
      title: 'Cost a garment order',
      mode: 'THEORY',
      requiredLevel: 2,
      isMandatory: false,
    },
  ],
};

/**
 * Competencies, assessment links and curated resources for the demo courses (Sprint 8), plus
 * trainer ratings in the pilot batch: everyone is verified on E01; students 021–028 are
 * verified at level 3 on the practical skills E04/E06, student 029 is at 2 and student 030 at
 * 1 on them (the BRD acceptance case: level 1 on a level-3 competency → gap 2). Fills only
 * what is missing.
 */
export async function seedCompetencies(prisma: PrismaClient, log: (m: string) => void) {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN.email } });
  let created = 0;
  let resources = 0;
  for (const [code, list] of Object.entries(COMPETENCIES)) {
    const course = await prisma.course.findUnique({ where: { code } });
    if (!course) continue;
    const pilotAssessments = await prisma.assessment.findMany({
      where: { batch: { courseId: course.id, name: PILOT_BATCH, cycle: { name: PILOT_CYCLE } } },
      select: { id: true, title: true },
    });
    for (const c of list) {
      const existing = await prisma.competency.findUnique({
        where: { courseId_code: { courseId: course.id, code: c.code } },
      });
      if (existing) continue;
      await prisma.$transaction(async (tx) => {
        const row = await tx.competency.create({
          data: {
            courseId: course.id,
            code: c.code,
            title: c.title,
            mode: c.mode,
            requiredLevel: c.requiredLevel,
            isMandatory: c.isMandatory,
            assessments: {
              create: pilotAssessments
                .filter((a) => c.evidence?.includes(a.title))
                .map((a) => ({ assessmentId: a.id })),
            },
          },
        });
        const curated = [
          { title: `Video: ${c.title.toLowerCase()}`, type: 'VIDEO' as const, url: video(c.title) },
          ...(c.reading ? [{ type: 'DOCUMENT' as const, ...c.reading }] : []),
        ];
        await tx.learningResource.createMany({
          data: curated.map((r) => ({
            competencyId: row.id,
            title: r.title,
            type: r.type,
            url: r.url,
            createdById: admin.id,
            approvedById: admin.id,
          })),
        });
        resources += curated.length;
        await audit.record(tx, {
          userId: null,
          action: 'COMPETENCY_CREATED',
          entity: 'Competency',
          entityId: row.id,
          newValue: { code: c.code, courseCode: code, by: 'seed' },
        });
      }, SEED_TX);
      created++;
    }
  }
  log(`competencies: ${created} added with ${resources} curated resources`);

  // Pilot batch ratings (trainer1), only if none exist yet.
  const batch = await prisma.batch.findFirst({
    where: { name: PILOT_BATCH, cycle: { name: PILOT_CYCLE } },
    include: {
      students: { orderBy: { student: { rollNo: 'asc' } }, select: { studentId: true } },
      course: { select: { id: true } },
    },
  });
  if (!batch || (await prisma.competencyRating.count({ where: { batchId: batch.id } })) > 0) {
    log('competency ratings: none added');
    return;
  }
  const trainer = await prisma.user.findUniqueOrThrow({ where: { email: TRAINERS[0]!.email } });
  const comps = new Map(
    (
      await prisma.competency.findMany({
        where: { courseId: batch.course.id, code: { in: ['E01', 'E04', 'E06'] } },
      })
    ).map((c) => [c.code, c]),
  );
  const now = new Date();
  const rows = batch.students.flatMap((s, i) => {
    const practical = i < 8 ? 3 : i === 8 ? 2 : 1;
    return [
      { code: 'E01', level: 3 },
      { code: 'E04', level: practical },
      { code: 'E06', level: practical },
    ]
      .filter((r) => comps.has(r.code))
      .map((r) => {
        const verified = r.level >= comps.get(r.code)!.requiredLevel;
        return {
          batchId: batch.id,
          studentId: s.studentId,
          competencyId: comps.get(r.code)!.id,
          level: r.level,
          ratedById: trainer.id,
          ratedAt: now,
          verifiedAt: verified ? now : null,
          verifiedById: verified ? trainer.id : null,
        };
      });
  });
  await prisma.$transaction(async (tx) => {
    await tx.competencyRating.createMany({ data: rows });
    await audit.record(tx, {
      userId: null,
      action: 'SEED_COMPETENCY_RATINGS',
      entity: 'Batch',
      entityId: batch.id,
      newValue: { ratings: rows.length, by: 'seed' },
    });
  }, SEED_TX);
  log(`competency ratings: ${rows.length} added in "${PILOT_BATCH}" (student 030 has a gap of 2)`);
}
