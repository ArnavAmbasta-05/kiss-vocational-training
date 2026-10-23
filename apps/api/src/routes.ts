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
  resourceRoutes,
  studentGapRoutes,
} from './modules/competency/competency.routes';
import { certificateRenderRoutes, completionRoutes } from './modules/completion/completion.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { adminBatchRoutes, batchRoutes } from './modules/batches/batches.routes';
import { adminCourseRoutes, catalogueRoutes } from './modules/courses/courses.routes';
import { adminEnrollmentRoutes, enrollmentRoutes } from './modules/enrollments/enrollments.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { certificateRoutes, studentCertificateRoutes } from './modules/documents/documents.routes';
import { healthRoutes } from './modules/health/health.routes';
import { notificationRoutes } from './modules/notifications/notifications.routes';
import { reportRoutes } from './modules/reports/reports.routes';
import { studentTrainingRoutes } from './modules/training/training.routes';
import { adminUserRoutes, meRoutes } from './modules/users/users.routes';

/** Everything under /api/v1. Each module mounts its own router here. */
export function v1Routes(): Router {
  const router = Router();
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
  // Innovation modules (R2). Core modules never import these; only this file wires them in.
  router.use('/courses', courseCompetencyRoutes());
  router.use('/competencies', competencyRoutes());
  router.use('/resources', resourceRoutes());
  router.use('/batches', batchCompetencyRoutes());
  router.use('/students', studentGapRoutes());
  router.use('/admin/users', adminUserRoutes());
  router.use('/admin/enrollments', adminEnrollmentRoutes());
  router.use('/admin', adminBatchRoutes());
  router.use('/admin', adminCourseRoutes());
  // Catalogue last: it mounts /courses and /cycles at the root of /api/v1.
  router.use('/', catalogueRoutes());
  return router;
}
