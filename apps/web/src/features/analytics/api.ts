import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  OutcomeAnalytics,
  Paginated,
  PlacementCandidate,
  PlacementDto,
  PlacementInput,
} from '@vtmp/shared';
import { api } from '../../lib/api/client';
import { downloadFile } from '../../lib/download';

export const useOutcomes = (cycleId: string | undefined) =>
  useQuery({
    queryKey: ['analytics', cycleId ?? 'all'],
    queryFn: ({ signal }) =>
      api.get<OutcomeAnalytics>('/analytics/outcomes', { signal, query: { cycleId } }),
    placeholderData: (prev) => prev,
  });

export function useRefreshAnalytics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ refreshed: boolean; refreshedAt: string | null }>('/analytics/refresh'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['analytics'] }),
  });
}

export const downloadOutcomesCsv = (cycleId: string | undefined) =>
  downloadFile(
    `/analytics/outcomes.csv${cycleId ? `?cycleId=${cycleId}` : ''}`,
    `outcomes-${new Date().toISOString().slice(0, 10)}.csv`,
  );

export const usePlacements = (page: number) =>
  useQuery({
    queryKey: ['placements', page],
    queryFn: ({ signal }) =>
      api.get<Paginated<PlacementDto>>('/analytics/placements', {
        signal,
        query: { page, pageSize: 10 },
      }),
    placeholderData: (prev) => prev,
  });

export const findCandidates = (rollNo: string) =>
  api.get<PlacementCandidate[]>('/analytics/placements/candidates', { query: { rollNo } });

function usePlacementMutation<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['placements'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

export const useCreatePlacement = () =>
  usePlacementMutation((input: PlacementInput) =>
    api.post<PlacementDto>('/analytics/placements', input),
  );

export const useDeletePlacement = () =>
  usePlacementMutation((id: string) => api.delete<void>(`/analytics/placements/${id}`));
