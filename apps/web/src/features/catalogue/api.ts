import { useQuery } from '@tanstack/react-query';
import type { CatalogueCourse, Cycle } from '@vtmp/shared';
import { api } from '../../lib/api/client';

export interface CatalogueResponse {
  cycle: Cycle | null;
  courses: CatalogueCourse[];
}

export function useCycles() {
  return useQuery({
    queryKey: ['cycles'],
    queryFn: ({ signal }) => api.get<Cycle[]>('/cycles', { signal }),
  });
}

/** Catalogue for a cycle; without cycleId the API picks the newest cycle with offerings. */
export function useCatalogue(cycleId?: string) {
  return useQuery({
    queryKey: ['catalogue', cycleId ?? 'default'],
    queryFn: ({ signal }) => api.get<CatalogueResponse>('/courses', { signal, query: { cycleId } }),
  });
}

export function useCatalogueCourse(id: string, cycleId?: string) {
  return useQuery({
    queryKey: ['catalogue', cycleId ?? 'default', id],
    queryFn: ({ signal }) =>
      api.get<{ cycle: Cycle; course: CatalogueCourse }>(`/courses/${id}`, {
        signal,
        query: { cycleId },
      }),
  });
}
