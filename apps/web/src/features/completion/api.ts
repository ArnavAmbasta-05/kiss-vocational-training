import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApproveResult,
  CertificateDto,
  CertificateListQuery,
  CompletionRow,
  Paginated,
} from '@vtmp/shared';
import { api } from '../../lib/api/client';
import { downloadFile } from '../../lib/download';

export const useCompletionQueue = (batchId: string | undefined) =>
  useQuery({
    queryKey: ['completions', batchId],
    enabled: !!batchId,
    queryFn: ({ signal }) =>
      api.get<CompletionRow[]>('/completions/queue', { signal, query: { batchId } }),
    staleTime: 0,
  });

export const useCertificates = (query: Partial<CertificateListQuery>) =>
  useQuery({
    queryKey: ['certificates', query],
    queryFn: ({ signal }) =>
      api.get<Paginated<CertificateDto>>('/certificates', {
        signal,
        query: { ...query, q: query.q || undefined, status: query.status || undefined },
      }),
    placeholderData: (prev) => prev,
  });

export const useMyCertificates = () =>
  useQuery({
    queryKey: ['certificates', 'mine'],
    queryFn: ({ signal }) => api.get<CertificateDto[]>('/students/me/certificates', { signal }),
    staleTime: 0,
  });

function useCompletionMutation<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all(
        ['completions', 'certificates', 'batches', 'my-training'].map((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        ),
      ),
  });
}

/** One Idempotency-Key per click (BRQ-7.2: a retried request never issues twice). */
export const useApprove = () =>
  useCompletionMutation((enrollmentId: string) =>
    api.post<ApproveResult>(`/completions/${enrollmentId}/approve`, undefined, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    }),
  );

export const useNotCompleted = () =>
  useCompletionMutation(({ enrollmentId, reason }: { enrollmentId: string; reason: string }) =>
    api.post(
      `/completions/${enrollmentId}/not-completed`,
      { reason },
      {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      },
    ),
  );

export const useRetryRender = () =>
  useCompletionMutation((certificateId: string) =>
    api.post<ApproveResult>(`/certificates/${certificateId}/render`),
  );

/** Downloads the certificate PDF (owner student or admin). */
export const downloadCertificate = (id: string, publicCode: string) =>
  downloadFile(`/certificates/${id}/download`, `certificate-${publicCode}.pdf`);
