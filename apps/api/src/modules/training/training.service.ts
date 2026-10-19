import type { StudentTraining } from '@vtmp/shared';
import { settings } from '../../core/settings';
import * as assessments from '../assessments/assessments.service';
import { gradeBand, weightedAggregate } from '../assessments/rules';
import * as attendance from '../attendance/attendance.service';
import * as batches from '../batches/batches.service';

/**
 * "My training" for one student (BRQ-5.3, BRQ-6.4): for each batch they are in, live
 * attendance, own session history, own results, current weighted aggregate and projected grade.
 * Nothing is cached or stored, so every load shows the latest figures (BO-4, rule 9).
 */
export async function forStudent(studentId: string): Promise<StudentTraining[]> {
  const [placements, bands, minAttendance] = await Promise.all([
    batches.placementsOf(studentId),
    settings.get('grade.bands'),
    settings.get('attendance.minPercent'),
  ]);
  return Promise.all(
    placements.map(async (p) => {
      const [figures, sessions, results, evaluation] = await Promise.all([
        attendance.studentFigures(p.batch.id, studentId),
        attendance.studentSessions(p.batch.id, studentId),
        assessments.studentResults(p.batch.id, studentId),
        assessments.evaluationFor(p.enrollmentId),
      ]);
      const aggregate = weightedAggregate(
        results
          .filter((r) => r.marks !== null)
          .map((r) => ({ marks: r.marks!, maxMarks: r.maxMarks, weightage: r.weightage })),
      );
      return {
        batch: p.batch,
        attendance: figures,
        minAttendancePercent: minAttendance,
        sessions,
        results,
        aggregate,
        projectedGrade: aggregate === null ? null : gradeBand(aggregate, bands),
        evaluation: evaluation
          ? {
              remarks: evaluation.remarks,
              recommended: evaluation.recommended,
              evaluatedAt: evaluation.evaluatedAt,
            }
          : null,
      };
    }),
  );
}
