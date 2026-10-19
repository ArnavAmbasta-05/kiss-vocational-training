import { useTranslation } from 'react-i18next';
import { Button } from './ui';

export function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation(['errors', 'common']);
  return (
    <div role="alert" className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-slate-900">{t('errors:boundary.title')}</h1>
      <p className="mt-2 text-slate-700">{t('errors:boundary.body')}</p>
      <div className="mt-6 flex justify-center gap-3">
        <Button onClick={onRetry}>{t('common:actions.retry')}</Button>
        <a
          href="/"
          className="inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-brand-700 underline hover:text-brand-900"
        >
          {t('common:actions.goHome')}
        </a>
      </div>
    </div>
  );
}
