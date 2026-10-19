import { Router, type Request } from 'express';
import { authenticate, owns, requireOwnership } from '../../core/auth';
import { asyncHandler } from '../../core/http';
import * as attendance from '../attendance/attendance.service';
import * as batches from '../batches/batches.service';
import * as service from './training.service';

/** "me" resolves to the signed-in student; ownership already checked it (or allowed staff). */
const studentId = (req: Request) =>
  req.params.studentId === 'me' ? req.user!.studentId! : req.params.studentId!;

/**
 * /students/:studentId/{training,attendance} — the student, their trainers, or admin.
 * Unknown → 404, someone else's → 403 (owns.student accepts "me").
 */
export function studentTrainingRoutes(): Router {
  const router = Router();
  const own = requireOwnership(owns.student());
  router.get(
    '/:studentId/training',
    authenticate,
    own,
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store').json(await service.forStudent(studentId(req)));
    }),
  );
  router.get(
    '/:studentId/attendance',
    authenticate,
    own,
    asyncHandler(async (req, res) => {
      const id = studentId(req);
      const placements = await batches.placementsOf(id);
      res.set('Cache-Control', 'no-store').json(
        await Promise.all(
          placements.map(async (p) => ({
            batch: p.batch,
            figures: await attendance.studentFigures(p.batch.id, id),
            sessions: await attendance.studentSessions(p.batch.id, id),
          })),
        ),
      );
    }),
  );
  return router;
}
