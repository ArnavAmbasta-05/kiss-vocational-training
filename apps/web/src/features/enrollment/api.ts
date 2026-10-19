import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Enrollment, MyEnrollment } from '@vtmp/shared';
import { api } from '../../lib/api/client';

export function useMyEnrollments() {
  return useQuery({
    queryKey: ['my-enrollments'],
    queryFn: ({ signal }) => api.get<MyEnrollment[]>('/enrollments/me', { signal }),
    // Status changes must show on the next visit (BO-4), so never serve a stale copy.
    staleTime: 0,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['my-enrollments'] }),
      qc.invalidateQueries({ queryKey: ['catalogue'] }),
    ]);
}

export function useSubmitEnrollment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { cycleId: string; courseIds: string[] }) =>
      api.post<Enrollment>('/enrollments', input, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateEnrollment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, courseIds }: { id: string; courseIds: string[] }) =>
      api.put<Enrollment>(`/enrollments/${id}`, { courseIds }),
    onSuccess: invalidate,
  });
}

export function useWithdrawEnrollment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post<Enrollment>(`/enrollments/${id}/withdraw`),
    onSuccess: invalidate,
  });
}
