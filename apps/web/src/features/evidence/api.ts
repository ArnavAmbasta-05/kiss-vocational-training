import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EvidenceAttachInput,
  EvidenceDto,
  EvidenceSheet,
  RubricDto,
  RubricInput,
  SignedFileUrl,
  UploadTarget,
} from '@vtmp/shared';
import { api } from '../../lib/api/client';

export const useEvidenceSheet = (assessmentId: string) =>
  useQuery({
    queryKey: ['evidence', assessmentId],
    queryFn: ({ signal }) =>
      api.get<EvidenceSheet>(`/assessments/${assessmentId}/evidence`, { signal }),
    staleTime: 0,
  });

export function useSaveRubric(assessmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RubricInput) =>
      api.put<RubricDto>(`/assessments/${assessmentId}/rubric`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['evidence', assessmentId] }),
  });
}

/**
 * Uploads straight to the store (never through the API): the API hands out a one-file target,
 * the browser sends the bytes there, then the API records the evidence.
 */
async function uploadFile(resultId: string, file: File): Promise<string> {
  const target = await api.post<UploadTarget>('/evidence/upload-url', {
    resultId,
    fileName: file.name,
    contentType: file.type,
    sizeBytes: file.size,
  });
  if (target.driver === 'vercel-blob') {
    // Loaded only when needed: the Blob client is not part of the main bundle.
    const { put } = await import('@vercel/blob/client');
    await put(target.key, file, {
      access: 'private',
      token: target.clientToken,
      contentType: file.type,
    });
  } else {
    const res = await fetch(target.url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  }
  return target.key;
}

export type NewEvidence =
  | ({ kind: 'FILE'; file: File } & Omit<
      Extract<EvidenceAttachInput, { kind: 'FILE' }>,
      'kind' | 'key' | 'fileName'
    >)
  | Extract<EvidenceAttachInput, { kind: 'LINK' }>;

export function useAddEvidence(assessmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ resultId, input }: { resultId: string; input: NewEvidence }) => {
      if (input.kind === 'LINK') {
        return api.post<EvidenceDto>(`/results/${resultId}/evidence`, input);
      }
      const { file, ...rest } = input;
      const key = await uploadFile(resultId, file);
      return api.post<EvidenceDto>(`/results/${resultId}/evidence`, {
        ...rest,
        kind: 'FILE',
        key,
        fileName: file.name,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['evidence', assessmentId] }),
  });
}

/**
 * Opens evidence in a new tab. The tab is opened during the click (so popup blockers allow it)
 * and pointed at the short-lived signed link once the API returns it.
 */
export async function openEvidence(evidenceId: string) {
  const tab = window.open('', '_blank');
  try {
    const { url } = await api.get<SignedFileUrl>(`/evidence/${evidenceId}/url`);
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      window.location.href = url;
    }
  } catch (err) {
    tab?.close();
    throw err;
  }
}
