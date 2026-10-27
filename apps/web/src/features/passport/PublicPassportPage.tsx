import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/api/client';
import { PageSkeleton } from '../../components/ui';
import { formatDay } from '../../lib/format';
import { usePublicPassport } from './api';

/**
 * /p/:token — a shared Skill Passport, read-only, without sign-in or app chrome (BRQ-10.3).
 * Shows only what the public API returns: name, photo, verified skills and certificates.
 */
export function PublicPassportPage() {
  const { token = '' } = useParams();
  const { t, i18n } = useTranslation(['passport', 'competency']);
  const lng = i18n.resolvedLanguage ?? 'en';
  const { data, isPending, error } = usePublicPassport(token);

  let body;
  if (isPending) body = <PageSkeleton />;
  else if (error || !data) {
    const code = error instanceof ApiError ? error.code : '';
    const [title, text] =
      code === 'LINK_INACTIVE'
        ? [t('public.inactive'), t('public.inactiveBody')]
        : code === 'LINK_NOT_FOUND'
          ? [t('public.notFound'), t('public.notFoundBody')]
          : [t('public.error'), ''];
    body = (
      <div
        role="status"
        className="rounded-lg border border-red-300 bg-red-50 p-6 text-center text-red-900"
      >
        <h1 className="text-xl font-bold">{title}</h1>
        {text && <p className="mt-2 text-sm">{text}</p>}
      </div>
    );
  } else {
    const groups = [
      { key: 'practical', label: t('practical'), items: data.practical },
      { key: 'theory', label: t('theory'), items: data.theory },
    ];
    body = (
      <article className="flex flex-col gap-6">
        <header className="flex items-center gap-4">
          {data.photoUrl && (
            <img
              src={data.photoUrl}
              alt=""
              width={72}
              height={72}
              className="h-[72px] w-[72px] rounded-full object-cover"
            />
          )}
          <div>
            <p className="text-sm font-medium text-brand-700">{t('public.title')}</p>
            <h1 className="text-2xl font-bold text-slate-900">{data.fullName}</h1>
          </div>
        </header>
        {groups.map(
          (g) =>
            g.items.length > 0 && (
              <section key={g.key} aria-labelledby={`pp-${g.key}`}>
                <h2 id={`pp-${g.key}`} className="mb-2 text-lg font-semibold text-slate-900">
                  {g.label}
                </h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {g.items.map((e) => (
                    <li
                      key={`${e.title}-${e.courseTitle}`}
                      className="rounded-md border border-slate-200 bg-white p-3"
                    >
                      <p className="font-medium text-slate-900">✓ {e.title}</p>
                      <p className="text-xs text-slate-600">
                        {t(`competency:level.${e.level}`)} · {e.courseTitle} ·{' '}
                        {formatDay(e.verifiedAt, lng)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ),
        )}
        {data.practical.length + data.theory.length === 0 && (
          <p className="text-sm text-slate-700">{t('noSkills')}</p>
        )}
        <section aria-labelledby="pp-certs">
          <h2 id="pp-certs" className="mb-2 text-lg font-semibold text-slate-900">
            {t('certificates')}
          </h2>
          {data.certificates.length === 0 ? (
            <p className="text-sm text-slate-700">{t('noCertificates')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.certificates.map((c) => (
                <li key={c.publicCode} className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="font-medium text-slate-900">{c.courseTitle}</p>
                  <p className="text-xs text-slate-600">
                    {t('public.grade', { grade: c.grade })} ·{' '}
                    {t('public.issued', { date: formatDay(c.issuedAt, lng) })} ·{' '}
                    <a
                      href={`/verify/${c.publicCode}`}
                      className="font-mono text-brand-700 underline"
                    >
                      {t('public.certificateId', { code: c.publicCode })}
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-3xl px-4 py-8">{body}</main>
      <footer className="px-4 pb-8 text-center text-xs text-slate-600">{t('public.by')}</footer>
    </div>
  );
}
