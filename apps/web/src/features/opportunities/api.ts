import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  InterestedStudent,
  JobRoleDto,
  JobRoleInput,
  OpportunityDto,
  OpportunityInput,
  OpportunityListQuery,
  OpportunityMatch,
  Paginated,
} from '@vtmp/shared';
import { api } from '../../lib/api/client';
import { downloadFile } from '../../lib/download';

export const useMatches = () =>
  useQuery({
    queryKey: ['matches'],
    queryFn: ({ signal }) => api.get<OpportunityMatch[]>('/students/me/matches', { signal }),
    staleTime: 0,
  });

export function useInterest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, interested }: { id: string; interested: boolean }) =>
      interested
        ? api.post<{ interested: boolean }>(`/opportunities/${id}/interest`)
        : api.delete<{ interested: boolean }>(`/opportunities/${id}/interest`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matches'] }),
  });
}

export const useJobRoles = () =>
  useQuery({
    queryKey: ['job-roles'],
    queryFn: ({ signal }) => api.get<JobRoleDto[]>('/job-roles', { signal }),
  });

export function useSaveRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: JobRoleInput }) =>
      id
        ? api.put<JobRoleDto>(`/job-roles/${id}`, input)
        : api.post<JobRoleDto>('/job-roles', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-roles'] }),
  });
}

export const useOpportunities = (query: Partial<OpportunityListQuery>) =>
  useQuery({
    queryKey: ['opportunities', query],
    queryFn: ({ signal }) =>
      api.get<Paginated<OpportunityDto>>('/opportunities', { signal, query }),
    placeholderData: (prev) => prev,
  });

export function useSaveOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: OpportunityInput }) =>
      id
        ? api.put<OpportunityDto>(`/opportunities/${id}`, input)
        : api.post<OpportunityDto>('/opportunities', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['opportunities'] });
      void qc.invalidateQueries({ queryKey: ['job-roles'] });
    },
  });
}

export const useInterested = (id: string | null) =>
  useQuery({
    queryKey: ['opportunity-interested', id],
    enabled: !!id,
    queryFn: ({ signal }) =>
      api.get<InterestedStudent[]>(`/opportunities/${id}/interested`, { signal }),
    staleTime: 0,
  });

export const downloadInterestedCsv = (id: string) =>
  downloadFile(`/opportunities/${id}/interested.csv`, `interested-${id.slice(0, 8)}.csv`);
