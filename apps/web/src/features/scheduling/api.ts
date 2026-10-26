import { useMutation, useQuery } from '@tanstack/react-query';
import type { SchedulingCheckInput, SchedulingCheckResult } from '@vtmp/shared';
import { api } from '../../lib/api/client';

type CheckBody = {
  batches: Array<Partial<SchedulingCheckInput['batches'][number]> & { batchId: string }>;
};

const check = (body: CheckBody) => api.post<SchedulingCheckResult>('/scheduling/check', body);

/** Advice for a fixed set of batches (the allocation preview). Read-only, so a query. */
export const useScheduleAdvice = (body: CheckBody | null) =>
  useQuery({
    queryKey: ['scheduling-check', body],
    enabled: !!body && body.batches.length > 0,
    queryFn: () => check(body!),
    staleTime: 0,
  });

/** On demand, e.g. after a session was refused for a clash. */
export const useScheduleCheck = () => useMutation({ mutationFn: check });
