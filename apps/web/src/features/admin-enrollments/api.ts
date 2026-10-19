import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminEnrollmentRow,
  Enrollment,
  EnrollmentStatus,
  Paginated,
  ReviewAction,
} from '@vtmp/shared';
import { api } from '../../lib/api/client';

export interface EnrollmentFilters {
  page: number;
  cycleId?: string;
  courseId: string;
  status: EnrollmentStatus | '';
  q: string;
}

export const PAGE_SIZE = 25;

export function useAdminEnrollments(filters: EnrollmentFilters) {
  return useQuery({
    queryKey: ['admin-enrollments', filters],
    enabled: !!filters.cycleId,
    queryFn: ({ signal }) =>
      api.get<Paginated<AdminEnrollmentRow>>('/admin/enrollments', {
        signal,
        query: {
          page: filters.page,
          pageSize: PAGE_SIZE,
          cycleId: filters.cycleId,
          courseId: filters.courseId || undefined,
          status: filters.status || undefined,
          q: filters.q || undefined,
        },
      }),
    placeholderData: keepPreviousData,
  });
}

/** One review action on one or many applications; each click carries a fresh Idempotency-Key. */
export function useReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ids,
      action,
      reason,
    }: {
      ids: string[];
      action: ReviewAction;
      reason?: string;
    }) => {
      const headers = { 'Idempotency-Key': crypto.randomUUID() };
      if (ids.length === 1) {
        const path = { APPROVE: 'approve', REJECT: 'reject', WAITLIST: 'waitlist' }[action];
        const body = action === 'APPROVE' ? undefined : reason ? { reason } : {};
        await api.post<Enrollment>(`/admin/enrollments/${ids[0]}/${path}`, body, { headers });
        return 1;
      }
      const res = await api.post<{ count: number }>(
        '/admin/enrollments/bulk',
        { ids, action, ...(reason ? { reason } : {}) },
        { headers },
      );
      return res.count;
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['admin-enrollments'] }),
        qc.invalidateQueries({ queryKey: ['catalogue'] }),
      ]),
  });
}
