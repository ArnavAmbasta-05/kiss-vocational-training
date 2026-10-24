import { useQuery } from '@tanstack/react-query';
import type { AuditFacets, AuditLogRow, AuditQuery, Paginated } from '@vtmp/shared';
import { api } from '../../lib/api/client';
import { downloadFile } from '../../lib/download';

type Filters = Partial<Omit<AuditQuery, 'page' | 'pageSize'>>;

const clean = (f: Filters) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== '')) as Record<
    string,
    string
  >;

export const useAuditLogs = (filters: Filters, page: number, pageSize: number) =>
  useQuery({
    queryKey: ['audit-logs', filters, page, pageSize],
    queryFn: ({ signal }) =>
      api.get<Paginated<AuditLogRow>>('/audit-logs', {
        signal,
        query: { ...clean(filters), page, pageSize },
      }),
    placeholderData: (prev) => prev,
    staleTime: 0,
  });

export const useAuditFacets = () =>
  useQuery({
    queryKey: ['audit-logs', 'facets'],
    queryFn: ({ signal }) => api.get<AuditFacets>('/audit-logs/facets', { signal }),
  });

export function downloadAuditCsv(filters: Filters) {
  const qs = new URLSearchParams(clean(filters)).toString();
  const stamp = new Date().toISOString().slice(0, 10);
  return downloadFile(`/audit-logs/export.csv${qs ? `?${qs}` : ''}`, `audit-log-${stamp}.csv`);
}
