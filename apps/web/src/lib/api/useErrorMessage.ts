import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from './client';

/**
 * Turns any thrown error into a translated sentence: known API codes map to
 * errors:codes.<CODE>, network failures to errors:network, everything else to errors:generic.
 */
export function useErrorMessage() {
  const { t } = useTranslation('errors');
  return useCallback(
    (err: unknown): string => {
      if (err instanceof ApiError) {
        if (err.isNetworkError) return t('network');
        return t(`codes.${err.code}`, { defaultValue: t('generic') });
      }
      return t('generic');
    },
    [t],
  );
}
