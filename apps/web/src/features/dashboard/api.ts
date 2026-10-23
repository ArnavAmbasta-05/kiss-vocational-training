import { useQuery } from '@tanstack/react-query';
import type { AdminDashboard, StudentDashboard, TrainerDashboard } from '@vtmp/shared';
import { api } from '../../lib/api/client';

/** Dashboards show live figures (BO-4): refetched on every visit. */
const live = { staleTime: 0 } as const;

export const useAdminDashboard = (cycleId: string | undefined) =>
  useQuery({
    queryKey: ['dashboard', 'admin', cycleId ?? 'all'],
    queryFn: ({ signal }) =>
      api.get<AdminDashboard>('/dashboard/admin', { signal, query: { cycleId } }),
    placeholderData: (prev) => prev,
    ...live,
  });

export const useTrainerDashboard = () =>
  useQuery({
    queryKey: ['dashboard', 'trainer'],
    queryFn: ({ signal }) => api.get<TrainerDashboard>('/dashboard/trainer', { signal }),
    ...live,
  });

export const useStudentDashboard = () =>
  useQuery({
    queryKey: ['dashboard', 'student'],
    queryFn: ({ signal }) => api.get<StudentDashboard>('/dashboard/student', { signal }),
    ...live,
  });
