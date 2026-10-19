import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@vtmp/shared';
import { api } from '../../lib/api/client';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    // 503 still carries a Health body (db down), so accept it rather than throw.
    queryFn: ({ signal }) => api.get<HealthResponse>('/health', { signal, acceptStatus: [503] }),
    retry: false,
    refetchInterval: 30_000,
  });
}
