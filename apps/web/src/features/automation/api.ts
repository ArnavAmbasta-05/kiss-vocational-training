import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AutomationRun, AutomationSettings, AutomationStatus } from '@vtmp/shared';
import { api } from '../../lib/api/client';

export function useAutomation() {
  return useQuery({
    queryKey: ['automation'],
    queryFn: ({ signal }) => api.get<AutomationStatus>('/admin/automation', { signal }),
  });
}

export function useSaveAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AutomationSettings) =>
      api.put<AutomationSettings>('/admin/automation', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation'] }),
  });
}

/** Runs the daily automation now; ran=false when a run is already going. */
export function useRunAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ ran: true; result: AutomationRun } | { ran: false }>(
        '/admin/automation/run',
        undefined,
        { headers: { 'Idempotency-Key': crypto.randomUUID() } },
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}
