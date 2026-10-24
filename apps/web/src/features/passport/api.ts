import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Passport,
  PassportShareCreated,
  PassportShareDto,
  PublicPassport,
} from '@vtmp/shared';
import { api } from '../../lib/api/client';
import { downloadFile } from '../../lib/download';

export const useMyPassport = () =>
  useQuery({
    queryKey: ['passport', 'me'],
    queryFn: ({ signal }) => api.get<Passport>('/students/me/passport', { signal }),
    staleTime: 0,
  });

export const useMyShares = () =>
  useQuery({
    queryKey: ['passport-shares'],
    queryFn: ({ signal }) =>
      api.get<PassportShareDto[]>('/students/me/passport/shares', { signal }),
    staleTime: 0,
  });

/** Public: no sign-in needed; 410 and 404 come back as errors with their codes. */
export const usePublicPassport = (token: string) =>
  useQuery({
    queryKey: ['public-passport', token],
    queryFn: ({ signal }) => api.get<PublicPassport>(`/public/passport/${token}`, { signal }),
    retry: false,
  });

export function useCreateShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (expiresInDays: number) =>
      api.post<PassportShareCreated>('/students/me/passport/shares', { expiresInDays }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passport-shares'] }),
  });
}

export function useRevokeShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<PassportShareDto>(`/passport/shares/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passport-shares'] }),
  });
}

export const downloadPassportPdf = (rollNo: string) =>
  downloadFile(
    '/students/me/passport.pdf',
    `skill-passport-${rollNo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
  );
