import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { LOCALES, LocaleSchema, type Me } from '@vtmp/shared';
import { Button, Card, Input, Select } from '../../components/ui';
import { useToast } from '../../components/toast';
import { api } from '../../lib/api/client';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { useAuth } from '../../lib/auth';

const FormSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^([0-9+\-\s]{7,20})?$/),
  // Students only: Odia script, printed under the English name on certificates (BRQ-16.2).
  nameOdia: z
    .string()
    .trim()
    .max(120)
    .regex(/^[଀-୿\s.'-]*$/),
  locale: LocaleSchema,
});
type FormValues = z.infer<typeof FormSchema>;

export function ProfilePage() {
  const { t, i18n } = useTranslation(['profile', 'common']);
  const { user, setUser } = useAuth();
  const toast = useToast();
  const errorMessage = useErrorMessage();

  const hasPhone = !!(user?.student || user?.trainer);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    values: user
      ? {
          fullName: user.fullName,
          phone: user.student?.phone ?? user.trainer?.phone ?? '',
          nameOdia: user.student?.nameOdia ?? '',
          locale: user.locale,
        }
      : undefined,
  });

  if (!user) return null;

  const onSubmit = handleSubmit(async (values) => {
    try {
      const updated = await api.patch<Me>('/users/me', {
        fullName: values.fullName,
        locale: values.locale,
        ...(hasPhone ? { phone: values.phone || null } : {}),
        ...(user.student ? { nameOdia: values.nameOdia || null } : {}),
      });
      setUser(updated);
      reset(values);
      if (i18n.resolvedLanguage !== updated.locale) void i18n.changeLanguage(updated.locale);
      toast.show({ tone: 'success', title: t('saved') });
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  });

  const idLabel = user.student ? t('rollNo') : user.trainer ? t('employeeCode') : null;
  const idValue = user.student?.rollNo ?? user.trainer?.employeeCode;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>

      <Card title={t('details')}>
        <dl className="mb-5 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-slate-600">{t('email')}</dt>
            <dd className="text-slate-900">{user.email}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">{t('role')}</dt>
            <dd className="text-slate-900">{t(`common:roles.${user.role}`)}</dd>
          </div>
          {idLabel && (
            <div>
              <dt className="font-medium text-slate-600">{idLabel}</dt>
              <dd className="text-slate-900">{idValue}</dd>
            </div>
          )}
        </dl>
        <p className="mb-4 text-xs text-slate-600">{t('emailHint')}</p>

        <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <Input
            label={t('fullName')}
            autoComplete="name"
            required
            error={errors.fullName && t('validation.fullName')}
            {...register('fullName')}
          />
          {hasPhone && (
            <Input
              label={t('phone')}
              type="tel"
              autoComplete="tel"
              error={errors.phone && t('validation.phone')}
              {...register('phone')}
            />
          )}
          {user.student && (
            <Input
              label={t('nameOdia')}
              hint={t('nameOdiaHint')}
              lang="or"
              error={errors.nameOdia && t('validation.nameOdia')}
              {...register('nameOdia')}
            />
          )}
          <Select
            label={t('language')}
            options={LOCALES.map((l) => ({ value: l, label: t(`common:language.${l}`) }))}
            {...register('locale')}
          />
          <div>
            <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
              {t('save')}
            </Button>
          </div>
        </form>
      </Card>

      <Card title={t('password.title')}>
        <Link
          to="/profile/password"
          className="text-sm font-medium text-brand-700 underline hover:text-brand-900"
        >
          {t('changePassword')}
        </Link>
      </Card>
    </div>
  );
}
