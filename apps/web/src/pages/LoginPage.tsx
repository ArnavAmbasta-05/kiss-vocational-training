import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LoginSchema, type LoginInput, type Role } from '@vtmp/shared';
import { LanguageSwitcher } from '../components/layout/LanguageSwitcher';
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
  const { t } = useTranslation(['auth', 'common']);
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
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between bg-brand-700 px-4 py-3 text-white">
        <span className="text-lg font-bold">{t('common:appName')}</span>
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>

          {formError && (
            <div
              role="alert"
              className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {formError}
            </div>
          )}

          <form noValidate onSubmit={(e) => void onSubmit(e)} className="mt-5 flex flex-col gap-4">
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
            <Button type="submit" loading={isSubmitting} className="mt-1 w-full">
              {isSubmitting ? t('submitting') : t('submit')}
            </Button>
          </form>
          <p className="mt-4 text-xs text-slate-600">{t('forgotHint')}</p>
        </div>
      </main>
      <footer className="px-4 py-3 text-center text-xs text-slate-600">
        {t('common:footer.institution')}
      </footer>
    </div>
  );
}
