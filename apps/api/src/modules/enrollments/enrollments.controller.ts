import type { Request } from 'express';
import type {
  AdminEnrollmentQuery,
  AutoApproval,
  AutoApproveRunInput,
  BulkReviewInput,
  EnrollmentSubmitInput,
  EnrollmentUpdateInput,
  ReviewAction,
} from '@vtmp/shared';
import { AppError } from '../../core/errors';
import { asyncHandler } from '../../core/http';
import * as service from './enrollments.service';

const adminActor = (req: Request) => ({ userId: req.user!.id, ip: req.ip ?? null });

function studentActor(req: Request): service.StudentActor {
  const studentId = req.user!.studentId;
  if (!studentId) throw AppError.forbidden('Only students can apply');
  return { userId: req.user!.id, studentId, ip: req.ip ?? null };
}

export const submit = asyncHandler(async (req, res) => {
  res.status(201).json(await service.submit(studentActor(req), req.body as EnrollmentSubmitInput));
});

export const mine = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store').json(await service.mine(studentActor(req).studentId));
});

export const update = asyncHandler(async (req, res) => {
  const { courseIds } = req.body as EnrollmentUpdateInput;
  res.json(await service.updatePreferences(studentActor(req), req.params.enrollmentId!, courseIds));
});

export const withdraw = asyncHandler(async (req, res) => {
  res.json(await service.withdraw(studentActor(req), req.params.enrollmentId!));
});

export const adminList = asyncHandler(async (req, res) => {
  res.json(await service.adminList(req.query as unknown as AdminEnrollmentQuery));
});

function reviewOne(action: ReviewAction) {
  return asyncHandler(async (req, res) => {
    const reason = (req.body as { reason?: string } | undefined)?.reason;
    const [result] = await service.review(adminActor(req), [req.params.id!], action, reason);
    res.json(result);
  });
}

export const approve = reviewOne('APPROVE');
export const reject = reviewOne('REJECT');
export const waitlist = reviewOne('WAITLIST');

export const bulk = asyncHandler(async (req, res) => {
  const { ids, action, reason } = req.body as BulkReviewInput;
  const data = await service.review(adminActor(req), ids, action, reason);
  res.json({ action, count: data.length, data });
});

export const autoApproval = asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'no-store').json(await service.autoApproval());
});

export const setAutoApproval = asyncHandler(async (req, res) => {
  res.json(await service.setAutoApproval(adminActor(req), req.body as AutoApproval));
});

export const runAutoApproval = asyncHandler(async (req, res) => {
  const { cycleId } = req.body as AutoApproveRunInput;
  res.json(await service.runAutoApproval(adminActor(req), cycleId));
});
