import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BootSpinner } from '../components/BootSpinner';
import { PublicFooter, PublicHeader } from '../components/layout/PublicChrome';
import { ROLE_HOME, useAuth } from '../lib/auth';

/** Line icons (24px grid, 1.5 stroke), decorative: the text beside them carries the meaning. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const ICONS = {
  apply: (
    <Icon>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </Icon>
  ),
  train: (
    <Icon>
      <path d="M14.5 5.5a3.5 3.5 0 0 0-4.6 4.3L4 15.7 6.3 18l5.9-5.9a3.5 3.5 0 0 0 4.3-4.6l-2 2-1.9-.5-.5-1.9z" />
    </Icon>
  ),
  certify: (
    <Icon>
      <circle cx="12" cy="9" r="5" />
      <path d="m9.5 13.5-1.5 7 4-2 4 2-1.5-7" />
      <path d="m10 9 1.5 1.5L14 8" />
    </Icon>
  ),
  passport: (
    <Icon>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16c.6-1.5 1.7-2 3-2s2.4.5 3 2M15 10h3M15 13h3" />
    </Icon>
  ),
  language: (
    <Icon>
      <path d="M4 5h9M8.5 3v2M6 5c.5 3 2.5 5.5 5 7M11 5c-.8 3.5-3 6-6 7.5" />
      <path d="m13 21 3.5-9 3.5 9M14.2 18h4.6" />
    </Icon>
  ),
  phone: (
    <Icon>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18.5h2" />
    </Icon>
  ),
  support: (
    <Icon>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </Icon>
  ),
};

/** Public front page (/): who the portal is for and what it does; signed-in users go home. */
export function HomePage() {
  const { t } = useTranslation(['home', 'common']);
  const { status, user } = useAuth();

  useEffect(() => {
    document.title = `${t('meta.title')} · ${t('common:appName')}`;
  }, [t]);

  if (status === 'loading') return <BootSpinner />;
  if (status === 'authenticated' && user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <PublicHeader />
      <main id="main-content" className="flex-1">
        <Hero />
        <VerifyBand />
        <Journey />
        <Promises />
      </main>
      <PublicFooter />
    </div>
  );
}

function Hero() {
  const { t } = useTranslation('home');
  return (
    <section
      className="relative overflow-hidden border-b border-slate-100"
      style={{
        backgroundColor: '#f8faff',
        backgroundImage: 'radial-gradient(#d9e8ff 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }}
    >
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.15fr_0.85fr] md:py-24">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
            {t('hero.eyebrow')}
          </p>
          <h1 className="mt-4 font-display text-4xl leading-[1.1] text-slate-900 sm:text-5xl lg:text-[3.4rem]">
            {t('hero.title1')}
            <br />
            <em className="text-brand-700">{t('hero.title2')}</em>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-700">{t('hero.body')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/login"
              className="inline-flex h-12 items-center rounded-lg bg-brand-700 px-6 text-base font-medium text-white hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              {t('hero.signIn')}
            </Link>
            <a
              href="#verify"
              className="inline-flex h-12 items-center rounded-lg border border-slate-300 bg-white px-6 text-base font-medium text-slate-900 hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              {t('hero.verify')}
            </a>
          </div>
        </div>
        <CertificateArt />
      </div>
    </section>
  );
}

// A fixed pattern for the illustrative QR (not a real code).
const QR = ['1110101', '1010011', '1110110', '0001010', '1101111', '0110001', '1011101'];

/** Illustration: a certificate with a seal, a QR and a "verified" chip. Decorative. */
function CertificateArt() {
  const { t } = useTranslation('home');
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-sm md:max-w-none">
      <div className="absolute -inset-6 rounded-[2rem] bg-brand-100/60 blur-2xl" />
      <div className="relative rotate-[-2deg] rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-brand-900/10">
        <div className="rounded-xl border-2 border-double border-brand-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="h-2 w-16 rounded bg-brand-700" />
              <div className="mt-2 h-1.5 w-24 rounded bg-slate-200" />
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-50 text-amber-600">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                <path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />
              </svg>
            </div>
          </div>
          <p className="mt-6 font-display text-2xl italic text-slate-800">{t('hero.art.title')}</p>
          <div className="mt-4 space-y-2">
            <div className="h-2 w-4/5 rounded bg-slate-200" />
            <div className="h-2 w-3/5 rounded bg-slate-200" />
          </div>
          <div className="mt-6 flex items-end justify-between">
            <div className="space-y-2">
              <div className="h-1.5 w-20 rounded bg-slate-300" />
              <div className="h-1.5 w-14 rounded bg-slate-200" />
            </div>
            <div className="grid grid-cols-7 gap-[2px] rounded border border-slate-200 p-1.5">
              {QR.join('')
                .split('')
                .map((c, i) => (
                  <span
                    key={i}
                    className={c === '1' ? 'h-2 w-2 bg-slate-800' : 'h-2 w-2 bg-transparent'}
                  />
                ))}
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-4 left-4 flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-800 shadow-lg shadow-emerald-900/10 sm:left-8">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </span>
        {t('hero.art.verified')}
      </div>
    </div>
  );
}

/** Employers check a certificate: the code goes to the standalone /verify page (NFR-09). */
function VerifyBand() {
  const { t } = useTranslation('home');
  const id = useId();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = code.replace(/\s+/g, '').toUpperCase();
    if (!/^[0-9A-Z]{8,40}$/.test(value)) {
      setError(t('verify.invalid'));
      return;
    }
    // /verify is its own small page, not part of this app's router.
    window.location.assign(`/verify/${encodeURIComponent(value)}`);
  };

  return (
    <section id="verify" aria-labelledby={`${id}-title`} className="scroll-mt-20 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid items-center gap-8 rounded-2xl border border-slate-200 bg-slate-50/60 p-6 sm:p-10 md:grid-cols-2">
          <div>
            <h2 id={`${id}-title`} className="font-display text-3xl text-slate-900">
              {t('verify.title')}
            </h2>
            <p className="mt-3 text-slate-700">{t('verify.body')}</p>
          </div>
          <form noValidate onSubmit={submit} className="flex flex-col gap-2">
            <label htmlFor={`${id}-code`} className="text-sm font-medium text-slate-900">
              {t('verify.label')}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id={`${id}-code`}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError(null);
                }}
                placeholder={t('verify.placeholder')}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : `${id}-hint`}
                className="h-12 flex-1 rounded-lg border border-slate-400 bg-white px-4 font-mono text-base uppercase tracking-wider text-slate-900 placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              />
              <button
                type="submit"
                className="h-12 rounded-lg bg-slate-900 px-6 text-base font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
              >
                {t('verify.submit')}
              </button>
            </div>
            {error ? (
              <p id={`${id}-error`} role="alert" className="text-sm text-red-700">
                {error}
              </p>
            ) : (
              <p id={`${id}-hint`} className="text-sm text-slate-600">
                {t('verify.hint')}
              </p>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}

const STEPS = ['apply', 'train', 'certify', 'passport'] as const;

function Journey() {
  const { t } = useTranslation('home');
  return (
    <section aria-labelledby="journey-title" className="bg-white">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
          {t('journey.eyebrow')}
        </p>
        <h2
          id="journey-title"
          className="mt-3 max-w-2xl font-display text-3xl text-slate-900 sm:text-4xl"
        >
          {t('journey.title')}
        </h2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step} className="relative rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  {ICONS[step]}
                </span>
                <span className="text-sm font-semibold tracking-widest text-brand-700">{`0${i + 1}`}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-slate-900">
                {t(`journey.${step}.title`)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {t(`journey.${step}.body`)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const PROMISES = ['language', 'phone', 'support'] as const;

function Promises() {
  const { t } = useTranslation('home');
  return (
    <section aria-labelledby="promises-title" className="bg-brand-900 text-white">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="promises-title" className="max-w-2xl font-display text-3xl sm:text-4xl">
          {t('promises.title')}
        </h2>
        <ul className="mt-10 grid gap-8 md:grid-cols-3">
          {PROMISES.map((p) => (
            <li key={p} className="flex gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-brand-100">
                {ICONS[p]}
              </span>
              <div>
                <h3 className="text-lg font-semibold">{t(`promises.${p}.title`)}</h3>
                <p className="mt-1 text-sm leading-relaxed text-brand-100">
                  {t(`promises.${p}.body`)}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-12">
          <Link
            to="/login"
            className="inline-flex h-12 items-center rounded-lg bg-white px-6 text-base font-medium text-brand-900 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900"
          >
            {t('promises.cta')}
          </Link>
        </div>
      </div>
    </section>
  );
}
