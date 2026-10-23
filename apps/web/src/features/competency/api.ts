import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CompetencyDto,
  CompetencyInput,
  Heatmap,
  LinkableAssessment,
  RatingGrid,
  RatingsSaveInput,
  ResourceDto,
  ResourceInput,
  StudentGaps,
} from '@vtmp/shared';
import { api } from '../../lib/api/client';

export const useCompetencies = (courseId: string | undefined) =>
  useQuery({
    queryKey: ['competencies', courseId],
    enabled: !!courseId,
    queryFn: ({ signal }) =>
      api.get<CompetencyDto[]>(`/courses/${courseId}/competencies`, { signal }),
  });

export const useLinkableAssessments = (courseId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['linkable-assessments', courseId],
    enabled: !!courseId && enabled,
    queryFn: ({ signal }) =>
      api.get<LinkableAssessment[]>(`/courses/${courseId}/linkable-assessments`, { signal }),
  });

export const useResources = (courseId: string | undefined) =>
  useQuery({
    queryKey: ['resources', courseId],
    enabled: !!courseId,
    queryFn: ({ signal }) => api.get<ResourceDto[]>(`/courses/${courseId}/resources`, { signal }),
  });

export const useRatingGrid = (batchId: string | undefined) =>
  useQuery({
    queryKey: ['competency-ratings', batchId],
    enabled: !!batchId,
    queryFn: ({ signal }) =>
      api.get<RatingGrid>(`/batches/${batchId}/competency-ratings`, { signal }),
    staleTime: 0,
  });

export const useHeatmap = (batchId: string | undefined) =>
  useQuery({
    queryKey: ['competency-heatmap', batchId],
    enabled: !!batchId,
    queryFn: ({ signal }) => api.get<Heatmap>(`/batches/${batchId}/competency-heatmap`, { signal }),
    staleTime: 0,
  });

export const useMyGaps = () =>
  useQuery({
    queryKey: ['gaps', 'me'],
    queryFn: ({ signal }) => api.get<StudentGaps>('/students/me/gaps', { signal }),
    staleTime: 0,
  });

function useCompetencyMutation<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all(
        ['competencies', 'resources', 'competency-ratings', 'competency-heatmap', 'gaps'].map((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        ),
      ),
  });
}

export const useSaveCompetency = () =>
  useCompetencyMutation(
    ({ courseId, id, input }: { courseId: string; id?: string; input: CompetencyInput }) =>
      id
        ? api.put<CompetencyDto>(`/competencies/${id}`, input)
        : api.post<CompetencyDto>(`/courses/${courseId}/competencies`, input),
  );

export const useDeleteCompetency = () =>
  useCompetencyMutation((id: string) => api.delete<void>(`/competencies/${id}`));

export const useSaveResource = () =>
  useCompetencyMutation(({ id, input }: { id?: string; input: ResourceInput }) =>
    id
      ? api.put<ResourceDto>(`/resources/${id}`, input)
      : api.post<ResourceDto>('/resources', input),
  );

export const useDeleteResource = () =>
  useCompetencyMutation((id: string) => api.delete<void>(`/resources/${id}`));

export const useApproveResource = () =>
  useCompetencyMutation((id: string) => api.post<ResourceDto>(`/resources/${id}/approve`));

export const useSaveRatings = () =>
  useCompetencyMutation(({ batchId, input }: { batchId: string; input: RatingsSaveInput }) =>
    api.put<RatingGrid>(`/batches/${batchId}/competency-ratings`, input),
  );
