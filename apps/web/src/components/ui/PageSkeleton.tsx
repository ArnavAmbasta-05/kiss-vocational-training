import { useTranslation } from 'react-i18next';

const block = 'rounded-md bg-slate-200 motion-safe:animate-pulse';

/**
 * Whole-page loading state: grey blocks in the shape of a page (title, intro, cards), so the
 * layout doesn't jump when the data arrives. Screen readers hear "Loading…" once.
 */
export function PageSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <div className={`${block} h-8 w-64 max-w-full`} />
        <div className={`${block} h-4 w-96 max-w-full`} />
      </div>
      <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className={`${block} h-4 w-1/2`} />
            <div className={`${block} mt-3 h-6 w-3/4`} />
            <div className={`${block} mt-3 h-4 w-full`} />
          </div>
        ))}
      </div>
    </div>
  );
}
