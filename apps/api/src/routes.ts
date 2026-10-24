import { Router } from 'express';
import {
  assessmentRoutes,
  batchAssessmentRoutes,
  evaluationRoutes,
} from './modules/assessments/assessments.routes';
import { batchAttendanceRoutes, sessionRoutes } from './modules/attendance/attendance.routes';
import {
  batchCompetencyRoutes,
  competencyRoutes,
  courseCompetencyRoutes,
  ratingRevokeRoutes,
  resourceRoutes,
  studentGapRoutes,
} from './modules/competency/competency.routes';
import { certificateRenderRoutes, completionRoutes } from './modules/completion/completion.routes';
import { auditLogRoutes } from './modules/audit/audit.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { adminBatchRoutes, batchRoutes } from './modules/batches/batches.routes';
import { adminCourseRoutes, catalogueRoutes } from './modules/courses/courses.routes';
import { adminEnrollmentRoutes, enrollmentRoutes } from './modules/enrollments/enrollments.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { certificateRoutes, studentCertificateRoutes } from './modules/documents/documents.routes';
import {
  internalJobRoutes,
  registerInterventionHooks,
  riskActionRoutes,
  riskFlagRoutes,
  studentRiskRoutes,
} from './modules/intervention/intervention.routes';
import { shareRoutes, studentPassportRoutes } from './modules/passport/passport.routes';
import { publicRoutes } from './modules/verification/verification.routes';
import { healthRoutes } from './modules/health/health.routes';
import { notificationRoutes } from './modules/notifications/notifications.routes';
import { reportRoutes } from './modules/reports/reports.routes';
import { studentTrainingRoutes } from './modules/training/training.routes';
import { adminUserRoutes, meRoutes } from './modules/users/users.routes';

/** Everything under /api/v1. Each module mounts its own router here. */
export function v1Routes(): Router {
  const router = Router();
  // Public, unauthenticated router first (rule 7): its own rate limit, whitelisted fields only.
  router.use('/public', publicRoutes());
  // Scheduled jobs: secret-protected, no user session (Vercel Cron in production).
  router.use('/internal/jobs', internalJobRoutes());
  router.use('/health', healthRoutes());
  router.use('/auth', authRoutes());
  router.use('/users', meRoutes());
  router.use('/notifications', notificationRoutes());
  // Staff-facing evaluation routes first: the enrollments router below is student-only.
  router.use('/enrollments', evaluationRoutes());
  router.use('/enrollments', enrollmentRoutes());
  router.use('/batches', batchAttendanceRoutes());
  router.use('/batches', batchAssessmentRoutes());
  router.use('/batches', batchRoutes());
  router.use('/sessions', sessionRoutes());
  router.use('/assessments', assessmentRoutes());
  router.use('/students', studentTrainingRoutes());
  router.use('/students', studentCertificateRoutes());
  router.use('/completions', completionRoutes());
  router.use('/certificates', certificateRenderRoutes());
  router.use('/certificates', certificateRoutes());
  router.use('/reports', reportRoutes());
  router.use('/dashboard', dashboardRoutes());
  router.use('/audit-logs', auditLogRoutes());
  // Innovation modules (R2). Core modules never import these; only this file wires them in.
  router.use('/courses', courseCompetencyRoutes());
  router.use('/competencies', competencyRoutes());
  router.use('/resources', resourceRoutes());
  router.use('/batches', batchCompetencyRoutes());
  router.use('/students', studentGapRoutes());
  router.use('/competency-ratings', ratingRevokeRoutes());
  router.use('/students', studentPassportRoutes());
  router.use('/passport', shareRoutes());
  router.use('/risk-flags', riskFlagRoutes());
  router.use('/risk-actions', riskActionRoutes());
  router.use('/students', studentRiskRoutes());
  // F11: saves of attendance, marks and ratings re-evaluate that batch's risk flags.
  registerInterventionHooks();
  router.use('/admin/users', adminUserRoutes());
  router.use('/admin/enrollments', adminEnrollmentRoutes());
  router.use('/admin', adminBatchRoutes());
  router.use('/admin', adminCourseRoutes());
  // Catalogue last: it mounts /courses and /cycles at the root of /api/v1.
  router.use('/', catalogueRoutes());
  return router;
}
