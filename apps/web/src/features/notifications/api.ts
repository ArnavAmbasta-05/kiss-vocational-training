import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppNotification } from '@vtmp/shared';
import { api } from '../../lib/api/client';

const KEY = ['notifications'];

export function useNotifications() {
  return useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) =>
      api.get<{ data: AppNotification[]; unreadCount: number }>('/notifications/me', {
        signal,
        query: { limit: 20 },
      }),
    // Light polling keeps the unread count current without websockets (serverless-friendly).
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/notifications/me/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
