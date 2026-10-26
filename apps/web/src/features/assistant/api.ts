import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AskInput,
  AssistantReply,
  AssistantStatus,
  AssistantUsage,
  MaterialDto,
  UploadTarget,
} from '@vtmp/shared';
import { api } from '../../lib/api/client';
import { uploadToTarget } from '../../lib/upload';

export const useAssistantStatus = () =>
  useQuery({
    queryKey: ['assistant-status'],
    queryFn: ({ signal }) => api.get<AssistantStatus>('/assistant/status', { signal }),
  });

export function useAsk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AskInput) => api.post<AssistantReply>('/assistant/ask', input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['assistant-status'] }),
  });
}

// ─── Admin ─────────────────────────────────────────────────────────────────────

export const useMaterials = () =>
  useQuery({
    queryKey: ['materials'],
    queryFn: ({ signal }) => api.get<MaterialDto[]>('/materials', { signal }),
  });

export const useAssistantUsage = () =>
  useQuery({
    queryKey: ['assistant-usage'],
    queryFn: ({ signal }) => api.get<AssistantUsage>('/assistant/usage', { signal }),
  });

function useMaterialMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials'] }),
  });
}

/** Upload straight to the store, then record the material as waiting for review. */
export const useAddMaterial = () =>
  useMaterialMutation(
    async ({ courseId, title, file }: { courseId: string; title: string; file: File }) => {
      const target = await api.post<UploadTarget>('/materials/upload-url', {
        courseId,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      const key = await uploadToTarget(target, file);
      return api.post<MaterialDto>('/materials', { courseId, title, key });
    },
  );

export const useApproveMaterial = () =>
  useMaterialMutation((id: string) => api.post<MaterialDto>(`/materials/${id}/approve`));

export const useRejectMaterial = () =>
  useMaterialMutation((id: string) => api.post<MaterialDto>(`/materials/${id}/reject`));

export const useDeleteMaterial = () =>
  useMaterialMutation((id: string) => api.delete<void>(`/materials/${id}`));
