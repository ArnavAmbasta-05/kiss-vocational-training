import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LoginSchema, type LoginInput, type Role } from '@vtmp/shared';
import { PublicFooter, PublicHeader } from '../components/layout/PublicChrome';
import { BootSpinner } from '../components/BootSpinner';
import { Button, Input } from '../components/ui';
import { useErrorMessage } from '../lib/api/useErrorMessage';
import { ROLE_HOME, useAuth } from '../lib/auth';

/** Only follow ?next= to an in-app path that belongs to the signed-in role. */
function safeNext(next: string | null, role: Role): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return ROLE_HOME[role];
  const section = next.split('/')[1];
  const ownSection = ROLE_HOME[role].slice(1);
  const roleSections = ['student', 'trainer', 'admin'];
  return roleSections.includes(section ?? '') && section !== ownSection ? ROLE_HOME[role] : next;
}

export function LoginPage() {
  const { t } = useTranslation(['auth', 'common', 'home']);
  const { status, user, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const errorMessage = useErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(LoginSchema) });

  useEffect(() => {
    document.title = `${t('title')} · ${t('common:appName')}`;
  }, [t]);

  if (status === 'loading') return <BootSpinner />;
  if (status === 'authenticated' && user) {
    return <Navigate to={safeNext(params.get('next'), user.role)} replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const me = await login(values);
      navigate(safeNext(params.get('next'), me.role), { replace: true });
    } catch (err) {
      setFormError(errorMessage(err));
      setFocus('password');
    }
  });

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <PublicHeader showSignIn={false} />
      <main
        id="main-content"
        className="flex flex-1 items-center"
        style={{
          backgroundColor: '#f8faff',
          backgroundImage: 'radial-gradient(#d9e8ff 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      >
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 md:grid-cols-2">
          <div className="hidden md:block">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
              {t('home:hero.eyebrow')}
            </p>
            <p className="mt-4 font-display text-4xl leading-tight text-slate-900 lg:text-5xl">
              {t('home:hero.title1')}
              <br />
              <em className="text-brand-700">{t('home:hero.title2')}</em>
            </p>
            <p className="mt-5 max-w-md text-slate-700">{t('welcome')}</p>
          </div>
          <div className="mx-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-brand-900/5">
            <h1 className="font-display text-3xl text-slate-900">{t('title')}</h1>
            <p className="mt-2 text-sm text-slate-600">{t('subtitle')}</p>

            {formError && (
              <div
                role="alert"
                className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                {formError}
              </div>
            )}

            <form
              noValidate
              onSubmit={(e) => void onSubmit(e)}
              className="mt-6 flex flex-col gap-4"
            >
              <Input
                label={t('email')}
                type="email"
                autoComplete="username"
                required
                error={errors.email && t('validation.email')}
                {...register('email')}
              />
              <Input
                label={t('password')}
                type="password"
                autoComplete="current-password"
                required
                error={errors.password && t('validation.passwordRequired')}
                {...register('password')}
              />
              <Button type="submit" loading={isSubmitting} className="mt-1 h-11 w-full">
                {isSubmitting ? t('submitting') : t('submit')}
              </Button>
            </form>
            <p className="mt-5 text-xs text-slate-600">{t('forgotHint')}</p>
            <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-700">
              {t('employer')}{' '}
              <a
                href="/verify"
                className="font-medium text-brand-700 underline hover:text-brand-900"
              >
                {t('home:nav.verify')}
              </a>
            </p>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
