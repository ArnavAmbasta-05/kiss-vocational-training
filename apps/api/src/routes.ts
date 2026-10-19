import { Router } from 'express';
import { authRoutes } from './modules/auth/auth.routes';
import { adminBatchRoutes, batchRoutes } from './modules/batches/batches.routes';
import { adminCourseRoutes, catalogueRoutes } from './modules/courses/courses.routes';
import { adminEnrollmentRoutes, enrollmentRoutes } from './modules/enrollments/enrollments.routes';
import { healthRoutes } from './modules/health/health.routes';
import { notificationRoutes } from './modules/notifications/notifications.routes';
import { adminUserRoutes, meRoutes } from './modules/users/users.routes';

/** Everything under /api/v1. Each module mounts its own router here. */
export function v1Routes(): Router {
  const router = Router();
  router.use('/health', healthRoutes());
  router.use('/auth', authRoutes());
  router.use('/users', meRoutes());
  router.use('/notifications', notificationRoutes());
  router.use('/enrollments', enrollmentRoutes());
  router.use('/batches', batchRoutes());
  router.use('/admin/users', adminUserRoutes());
  router.use('/admin/enrollments', adminEnrollmentRoutes());
  router.use('/admin', adminBatchRoutes());
  router.use('/admin', adminCourseRoutes());
  // Catalogue last: it mounts /courses and /cycles at the root of /api/v1.
  router.use('/', catalogueRoutes());
  return router;
}
