import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AutomationRun, AutomationSettings } from '@vtmp/shared';
import { Badge, Button, Card, EmptyState, Input, PageSkeleton, Table } from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { formatDate } from '../../lib/format';
import { useAutomation, useRunAutomation, useSaveAutomation } from './api';

type NumberField = {
  [K in keyof AutomationSettings]: AutomationSettings[K] extends number ? K : never;
}[keyof AutomationSettings];
type SwitchField = Exclude<keyof AutomationSettings, NumberField>;

/** Allowed ranges, as the API checks them (AutomationSettingsSchema). */
const RANGES: Record<NumberField, [number, number]> = {
  autoCloseAfterDays: [0, 90],
  latePlacementDays: [0, 60],
  pendingReminderDays: [1, 60],
  passportExpiryNoticeDays: [1, 60],
  opportunityMatchPercent: [0, 100],
  placementFollowUpDays: [7, 730],
  analyticsAutoRefreshMinutes: [1, 1440],
};
const NUMBERS = Object.keys(RANGES) as NumberField[];

const checkbox =
  'h-4 w-4 rounded border-slate-400 text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600';

/**
 * Round 2 review A1–A9: the admin's automation switches and limits, the last daily run and
 * Run now. Every value is a Setting; each change is audited by the API.
 */
export function AutomationPage() {
  const { t, i18n } = useTranslation('automation');
  const lng = i18n.resolvedLanguage ?? 'en';
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const status = useAutomation();
  const save = useSaveAutomation();
  const run = useRunAutomation();
  const [switches, setSwitches] = useState<Record<SwitchField, boolean> | null>(null);
  const [numbers, setNumbers] = useState<Record<NumberField, string> | null>(null);

  useEffect(() => {
    const s = status.data?.settings;
    if (!s) return;
    setSwitches({
      autoCloseBatches: s.autoCloseBatches,
      autoPromoteWaitlist: s.autoPromoteWaitlist,
      reminders: s.reminders,
      notices: s.notices,
    });
    setNumbers(
      Object.fromEntries(NUMBERS.map((k) => [k, String(s[k])])) as Record<NumberField, string>,
    );
  }, [status.data]);

  if (status.isPending) return <PageSkeleton />;
  if (status.isError) return <EmptyState title={errorMessage(status.error)} />;
  if (!switches || !numbers) return null;

  const errorOf = (k: NumberField) => {
    const v = Number(numbers[k]);
    const [min, max] = RANGES[k];
    return numbers[k].trim() === '' || Number.isNaN(v) || v < min || v > max
      ? t('range', { min, max })
      : undefined;
  };
  const invalid = NUMBERS.some((k) => errorOf(k));
  const form = {
    ...switches,
    ...Object.fromEntries(NUMBERS.map((k) => [k, Number(numbers[k])])),
  } as AutomationSettings;
  const saved = status.data.settings;
  const dirty = (Object.keys(form) as Array<keyof AutomationSettings>).some(
    (k) => form[k] !== saved[k],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    try {
      await save.mutateAsync(form);
      toast.show({ tone: 'success', title: t('saved') });
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };
  const runNow = async () => {
    try {
      const r = await run.mutateAsync();
      toast.show(
        r.ran ? { tone: 'success', title: t('run.done') } : { tone: 'info', title: t('run.busy') },
      );
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };

  const toggle = (k: SwitchField) => (
    <Switch
      label={t(`fields.${k}`)}
      checked={switches[k]}
      onChange={(v) => setSwitches({ ...switches, [k]: v })}
    />
  );
  const number = (k: NumberField) => (
    <Input
      label={t(`fields.${k}`)}
      hint={t(`hints.${k}`)}
      type="number"
      inputMode="numeric"
      min={RANGES[k][0]}
      max={RANGES[k][1]}
      value={numbers[k]}
      error={errorOf(k)}
      onChange={(e) => setNumbers({ ...numbers, [k]: e.target.value })}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-700">{t('intro')}</p>
      </div>

      <LastRun run={status.data.lastRun} lng={lng}>
        <Button variant="secondary" loading={run.isPending} onClick={() => void runNow()}>
          {t('run.now')}
        </Button>
      </LastRun>

      <form className="flex flex-col gap-6" onSubmit={(e) => void submit(e)} noValidate>
        <Card title={t('groups.batches')} headingLevel={2}>
          <div className="flex flex-col gap-4">
            {toggle('autoCloseBatches')}
            <div className="grid gap-4 sm:grid-cols-2">{number('autoCloseAfterDays')}</div>
            {toggle('autoPromoteWaitlist')}
            <div className="grid gap-4 sm:grid-cols-2">{number('latePlacementDays')}</div>
          </div>
        </Card>
        <Card title={t('groups.reminders')} headingLevel={2}>
          <div className="flex flex-col gap-4">
            {toggle('reminders')}
            <div className="grid gap-4 sm:grid-cols-2">
              {number('pendingReminderDays')}
              {number('placementFollowUpDays')}
            </div>
          </div>
        </Card>
        <Card title={t('groups.notices')} headingLevel={2}>
          <div className="flex flex-col gap-4">
            {toggle('notices')}
            <div className="grid gap-4 sm:grid-cols-2">
              {number('passportExpiryNoticeDays')}
              {number('opportunityMatchPercent')}
            </div>
          </div>
        </Card>
        <Card title={t('groups.other')} headingLevel={2}>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">{number('analyticsAutoRefreshMinutes')}</div>
            <p className="text-sm text-slate-700">
              {t('autoApproval')}{' '}
              <Link
                to="/admin/enrollments"
                className="font-medium text-brand-700 underline hover:text-brand-900"
              >
                {t('autoApprovalLink')}
              </Link>
            </p>
          </div>
        </Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={save.isPending} disabled={!dirty || invalid}>
            {t('save')}
          </Button>
          {dirty && <span className="text-xs text-slate-600">{t('unsaved')}</span>}
        </div>
      </form>
    </div>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-slate-900">
      <input
        id={id}
        type="checkbox"
        className={checkbox}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="font-medium">{label}</span>
    </label>
  );
}

/** The last daily run: when, and what each step did. */
function LastRun({
  run,
  lng,
  children,
}: {
  run: AutomationRun | null;
  lng: string;
  children: ReactNode;
}) {
  const { t } = useTranslation('automation');
  return (
    <Card title={t('run.title')} headingLevel={2} actions={children}>
      {!run ? (
        <EmptyState title={t('run.never')} />
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-700">
            {t('run.at', { when: formatDate(run.ranAt, lng, true) })}
          </p>
          <Table
            caption={t('run.caption')}
            columns={[
              { key: 'step', header: t('run.step'), render: (s) => t(`steps.${s.step}`) },
              {
                key: 'state',
                header: t('run.state'),
                render: (s) =>
                  s.error ? (
                    <Badge tone="danger">{t('run.failed')}</Badge>
                  ) : s.enabled ? (
                    <Badge tone="success">{t('run.on')}</Badge>
                  ) : (
                    <Badge tone="neutral">{t('run.off')}</Badge>
                  ),
              },
              { key: 'count', header: t('run.count'), align: 'right', render: (s) => s.count },
            ]}
            rows={run.steps}
            rowKey={(s) => s.step}
          />
        </>
      )}
    </Card>
  );
}
