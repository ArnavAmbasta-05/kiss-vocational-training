import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ActionCreateInput,
  ActionUpdateInput,
  MyRiskFlag,
  Paginated,
  RiskEvaluationSummary,
  RiskFlagDetail,
  RiskFlagQuery,
  RiskFlagRow,
} from '@vtmp/shared';
import { api } from '../../lib/api/client';

export const useRiskFlags = (query: Partial<RiskFlagQuery>) =>
  useQuery({
    queryKey: ['risk-flags', query],
    queryFn: ({ signal }) =>
      api.get<Paginated<RiskFlagRow>>('/risk-flags', {
        signal,
        query: {
          ...query,
          batchId: query.batchId || undefined,
          level: query.level || undefined,
          escalated: query.escalated === undefined ? undefined : String(query.escalated),
        },
      }),
    placeholderData: (prev) => prev,
    staleTime: 0,
  });

export const useRiskFlag = (id: string) =>
  useQuery({
    queryKey: ['risk-flag', id],
    queryFn: ({ signal }) => api.get<RiskFlagDetail>(`/risk-flags/${id}`, { signal }),
    staleTime: 0,
  });

export const useMyRisk = () =>
  useQuery({
    queryKey: ['risk', 'me'],
    queryFn: ({ signal }) => api.get<MyRiskFlag[]>('/students/me/risk', { signal }),
    staleTime: 0,
  });

function useFlagMutation<A>(fn: (a: A) => Promise<RiskFlagDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (detail) => {
      qc.setQueryData(['risk-flag', detail.id], detail);
      void qc.invalidateQueries({ queryKey: ['risk-flags'] });
    },
  });
}

export const useAddAction = (flagId: string) =>
  useFlagMutation((input: ActionCreateInput) =>
    api.post<RiskFlagDetail>(`/risk-flags/${flagId}/actions`, input),
  );

export const useCompleteAction = () =>
  useFlagMutation(({ id, ...input }: ActionUpdateInput & { id: string }) =>
    api.patch<RiskFlagDetail>(`/risk-actions/${id}`, input),
  );

/** Admin: run the daily check now (the same job the cron runs). */
export function useRunEvaluation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<RiskEvaluationSummary & { skipped: boolean }>('/risk-flags/evaluate'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risk-flags'] }),
  });
}
