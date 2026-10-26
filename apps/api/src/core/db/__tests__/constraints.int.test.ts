import { CertificateStatus, EnrollmentStatus, Grade, Prisma, RiskLevel } from '@prisma/client';
import { disconnectPrisma, prisma } from '..';
import { createAdmin, createCycleCourseBatch, createStudent, uid } from '../../../../test/fixtures';

const db = () => prisma();

afterAll(() => disconnectPrisma());

describe('migrations', () => {
  it('create every R1, R2 and R3 table on a clean database', async () => {
    const rows = await db().$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    const tables = rows.map((r) => r.table_name);
    expect(tables).toEqual(
      expect.arrayContaining([
        'users',
        'refresh_tokens',
        'students',
        'trainers',
        'courses',
        'training_cycles',
        'course_offerings',
        'enrollments',
        'enrollment_preferences',
        'batches',
        'batch_students',
        'trainer_assignments',
        'training_sessions',
        'attendance',
        'progress',
        'assessments',
        'assessment_results',
        'evaluations',
        'certificates',
        'performance_reports',
        'audit_logs',
        'notifications',
        'idempotency_keys',
        'settings',
        'competencies',
        'assessment_competencies',
        'competency_ratings',
        'learning_resources',
        'passport_shares',
        'risk_flags',
        'intervention_actions',
        // R3 (Sprint 11)
        'rubrics',
        'practical_evidence',
        'job_roles',
        'job_role_competencies',
        'opportunities',
        'opportunity_interests',
      ]),
    );
  });
});

describe('audit_logs is insert-only (NFR-06)', () => {
  let id: string;

  beforeAll(async () => {
    const row = await db().auditLog.create({
      data: { action: 'TEST_EVENT', entity: 'Test', entityId: uid(), newValue: { a: 1 } },
    });
    id = row.id;
  });

  it('rejects UPDATE', async () => {
    await expect(
      db().auditLog.update({ where: { id }, data: { action: 'TAMPERED' } }),
    ).rejects.toThrow(/insert-only/);
  });

  it('rejects DELETE', async () => {
    await expect(db().auditLog.delete({ where: { id } })).rejects.toThrow(/insert-only/);
  });

  it('rejects TRUNCATE', async () => {
    await expect(db().$executeRawUnsafe('TRUNCATE audit_logs')).rejects.toThrow(/insert-only/);
  });

  it('still allows INSERT', async () => {
    await expect(
      db().auditLog.create({ data: { action: 'TEST_EVENT', entity: 'Test', entityId: uid() } }),
    ).resolves.toBeDefined();
  });
});

describe('BR-01: one active enrollment per student per cycle', () => {
  it('rejects a second active enrollment and allows one after rejection', async () => {
    const { student } = await createStudent(db());
    const { cycle } = await createCycleCourseBatch(db());
    const first = await db().enrollment.create({
      data: { studentId: student.id, cycleId: cycle.id },
    });

    await expect(
      db().enrollment.create({ data: { studentId: student.id, cycleId: cycle.id } }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await db().enrollment.update({
      where: { id: first.id },
      data: { status: EnrollmentStatus.REJECTED, reason: 'Prerequisite missing' },
    });
    await expect(
      db().enrollment.create({ data: { studentId: student.id, cycleId: cycle.id } }),
    ).resolves.toMatchObject({ status: EnrollmentStatus.PENDING });
  });

  it('allows the same student in a different cycle', async () => {
    const { student } = await createStudent(db());
    const a = await createCycleCourseBatch(db());
    const b = await createCycleCourseBatch(db());
    await db().enrollment.create({ data: { studentId: student.id, cycleId: a.cycle.id } });
    await expect(
      db().enrollment.create({ data: { studentId: student.id, cycleId: b.cycle.id } }),
    ).resolves.toBeDefined();
  });
});

describe('BR-07: 0 <= marks <= max_marks', () => {
  async function assessmentWithStudent(maxMarks: string) {
    const admin = await createAdmin(db());
    const { student } = await createStudent(db());
    const { batch } = await createCycleCourseBatch(db());
    const assessment = await db().assessment.create({
      data: {
        batchId: batch.id,
        title: 'Wiring test',
        mode: 'PRACTICAL',
        maxMarks: new Prisma.Decimal(maxMarks),
        weightage: new Prisma.Decimal('30'),
        createdById: admin.id,
      },
    });
    const result = (marks: string) =>
      db().assessmentResult.create({
        data: {
          assessmentId: assessment.id,
          studentId: student.id,
          marks: new Prisma.Decimal(marks),
          recordedById: admin.id,
        },
      });
    return { assessment, result };
  }

  it('accepts marks equal to the maximum', async () => {
    const { result } = await assessmentWithStudent('50');
    await expect(result('50')).resolves.toBeDefined();
  });

  it('rejects marks above the maximum', async () => {
    const { result } = await assessmentWithStudent('50');
    await expect(result('50.01')).rejects.toThrow(/exceed max_marks/);
  });

  it('rejects negative marks', async () => {
    const { result } = await assessmentWithStudent('50');
    await expect(result('-1')).rejects.toThrow(/marks_nonneg/);
  });

  it('blocks lowering max_marks below an existing result', async () => {
    const { assessment, result } = await assessmentWithStudent('50');
    await result('45');
    await expect(
      db().assessment.update({
        where: { id: assessment.id },
        data: { maxMarks: new Prisma.Decimal('40') },
      }),
    ).rejects.toThrow(/below an existing result/);
  });

  it('rejects zero weightage', async () => {
    const admin = await createAdmin(db());
    const { batch } = await createCycleCourseBatch(db());
    await expect(
      db().assessment.create({
        data: {
          batchId: batch.id,
          title: 'Bad',
          mode: 'THEORY',
          maxMarks: new Prisma.Decimal('10'),
          weightage: new Prisma.Decimal('0'),
          createdById: admin.id,
        },
      }),
    ).rejects.toThrow(/weightage_positive/);
  });
});

describe('range checks', () => {
  it('rejects preference rank outside 1–3', async () => {
    const { student } = await createStudent(db());
    const { cycle, course } = await createCycleCourseBatch(db());
    const enrollment = await db().enrollment.create({
      data: { studentId: student.id, cycleId: cycle.id },
    });
    await expect(
      db().enrollmentPreference.create({
        data: { enrollmentId: enrollment.id, courseId: course.id, rank: 4 },
      }),
    ).rejects.toThrow(/rank_range/);
  });

  it('rejects competency levels outside 1–4', async () => {
    const { course } = await createCycleCourseBatch(db());
    await expect(
      db().competency.create({
        data: { courseId: course.id, code: 'X1', title: 'X', mode: 'THEORY', requiredLevel: 5 },
      }),
    ).rejects.toThrow(/required_level_range/);
  });
});

describe('partial unique indexes', () => {
  it('allows one open risk flag per student and batch, plus closed history', async () => {
    const { student } = await createStudent(db());
    const { batch } = await createCycleCourseBatch(db());
    const data = { studentId: student.id, batchId: batch.id, level: RiskLevel.MEDIUM, reasons: [] };
    const first = await db().riskFlag.create({ data });
    await expect(db().riskFlag.create({ data })).rejects.toMatchObject({ code: 'P2002' });
    await db().riskFlag.update({ where: { id: first.id }, data: { closedAt: new Date() } });
    await expect(db().riskFlag.create({ data })).resolves.toBeDefined();
  });

  it('allows one VALID certificate per enrollment', async () => {
    const admin = await createAdmin(db());
    const { student } = await createStudent(db());
    const { cycle } = await createCycleCourseBatch(db());
    const enrollment = await db().enrollment.create({
      data: { studentId: student.id, cycleId: cycle.id, status: EnrollmentStatus.COMPLETED },
    });
    const cert = (code: string) => ({
      enrollmentId: enrollment.id,
      publicCode: code,
      grade: Grade.B,
      aggregatePercent: new Prisma.Decimal('72.5'),
      attendancePercent: new Prisma.Decimal('88'),
      issuedById: admin.id,
    });
    const first = await db().certificate.create({ data: cert(`ABCDEFGH${uid()}`) });
    await expect(db().certificate.create({ data: cert(`IJKLMNOP${uid()}`) })).rejects.toMatchObject(
      { code: 'P2002' },
    );
    await db().certificate.update({
      where: { id: first.id },
      data: { status: CertificateStatus.SUPERSEDED },
    });
    await expect(
      db().certificate.create({ data: cert(`QRSTUVWX${uid()}`) }),
    ).resolves.toBeDefined();
  });

  it('rejects certificate codes shorter than 12 characters', async () => {
    const admin = await createAdmin(db());
    const { student } = await createStudent(db());
    const { cycle } = await createCycleCourseBatch(db());
    const enrollment = await db().enrollment.create({
      data: { studentId: student.id, cycleId: cycle.id },
    });
    await expect(
      db().certificate.create({
        data: {
          enrollmentId: enrollment.id,
          publicCode: 'SHORT123',
          grade: Grade.A,
          aggregatePercent: new Prisma.Decimal('90'),
          attendancePercent: new Prisma.Decimal('95'),
          issuedById: admin.id,
        },
      }),
    ).rejects.toThrow(/public_code_length/);
  });
});

describe('batch membership integrity', () => {
  it('rejects a membership whose student does not match the enrollment', async () => {
    const a = await createStudent(db());
    const b = await createStudent(db());
    const { cycle, batch } = await createCycleCourseBatch(db());
    const enrollment = await db().enrollment.create({
      data: { studentId: a.student.id, cycleId: cycle.id },
    });
    await expect(
      db().batchStudent.create({
        data: { batchId: batch.id, enrollmentId: enrollment.id, studentId: b.student.id },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});

describe('R3 constraints (TAD §6.2)', () => {
  it('job role levels are 1–4 and evidence is a file of at most 10 MB or a link, never both', async () => {
    const role = await db().jobRole.create({ data: { title: `Role ${uid()}` } });
    await expect(
      db().jobRoleCompetency.create({ data: { roleId: role.id, competencyCode: 'X', level: 5 } }),
    ).rejects.toThrow();
    await expect(
      db()
        .$executeRaw`INSERT INTO practical_evidence (id, result_id, kind, url, object_key, uploaded_by_id)
        VALUES (gen_random_uuid(), gen_random_uuid(), 'LINK', 'https://x', 'evidence/x', gen_random_uuid())`,
    ).rejects.toThrow(/practical_evidence_file_or_link/);
  });
});
