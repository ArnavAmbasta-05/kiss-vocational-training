import { useEffect, useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  INTERVENTION_ACTION_TYPES,
  type InterventionActionDto,
  type InterventionActionType,
  type RiskFlagDetail,
  type RiskTimelineEvent,
} from '@vtmp/shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Spinner,
  Table,
  type Column,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { formatDate, formatDay } from '../../lib/format';
import { useAddAction, useCompleteAction, useRiskFlag } from './api';
import { LevelBadge, ReasonChips } from './RiskBits';
import { daysSince, useReasonText } from './risk';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** One flag: why, its history (level changes and actions) and the remedial actions (BRQ-11.3, 11.4). */
export function FlagDetailPage({ back }: { back: string }) {
  const { flagId = '' } = useParams();
  const { t, i18n } = useTranslation('intervention');
  const lng = i18n.resolvedLanguage ?? 'en';
  const errorMessage = useErrorMessage();
  const flag = useRiskFlag(flagId);
  const [adding, setAdding] = useState(false);
  const [completing, setCompleting] = useState<InterventionActionDto | null>(null);

  if (flag.isPending) return <Spinner size="lg" />;
  if (flag.isError) return <EmptyState title={errorMessage(flag.error)} />;
  const f = flag.data;
  const open = f.status === 'OPEN';

  const columns: Column<InterventionActionDto>[] = [
    { key: 'type', header: t('actions.type'), render: (a) => t(`actionType.${a.type}`) },
    { key: 'owner', header: t('actions.owner'), render: (a) => a.owner.fullName },
    { key: 'due', header: t('actions.due'), render: (a) => formatDay(a.dueOn, lng) },
    {
      key: 'note',
      header: t('actions.note'),
      render: (a) => a.note ?? <span className="text-slate-600">{t('actions.noNote')}</span>,
    },
    {
      key: 'outcome',
      header: t('actions.outcome'),
      render: (a) =>
        a.completedAt ? (
          <span>
            <Badge tone="success">{t('actions.done')}</Badge>
            <span className="mt-1 block text-sm">{a.outcome}</span>
            <span className="block text-xs text-slate-600">{formatDate(a.completedAt, lng)}</span>
          </span>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            aria-label={t('actions.recordFor', { type: t(`actionType.${a.type}`) })}
            onClick={() => setCompleting(a)}
          >
            {t('actions.record')}
          </Button>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link to={back} className="text-sm text-brand-700 underline-offset-2 hover:underline">
        ← {t('detail.back')}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{f.student.fullName}</h1>
          <p className="mt-1 text-sm text-slate-700">
            {f.student.rollNo} · {f.batch.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LevelBadge level={f.level} />
          <Badge tone={open ? 'info' : 'neutral'}>{t(`status.${f.status}`)}</Badge>
          {f.escalatedAt && <Badge tone="danger">{t('list.escalated')}</Badge>}
        </div>
      </div>

      <Card title={t('detail.why')} headingLevel={2}>
        <ReasonChips reasons={f.reasons} />
        <p className="mt-3 text-sm text-slate-700">
          {f.closedAt
            ? t('detail.closedOn', { date: formatDate(f.closedAt, lng) })
            : f.clearSince
              ? t('detail.improving', {
                  date: formatDate(f.clearSince, lng),
                  days: f.closeAfterClearDays,
                })
              : t('detail.openFor', { count: daysSince(f.openedAt) })}
        </p>
      </Card>

      <Card
        title={t('actions.title')}
        headingLevel={2}
        actions={
          open ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              {t('actions.add')}
            </Button>
          ) : undefined
        }
      >
        <Table
          caption={t('actions.title')}
          columns={columns}
          rows={f.actions}
          rowKey={(a) => a.id}
          empty={<p className="text-sm text-slate-700">{t('actions.none')}</p>}
        />
      </Card>

      <Card title={t('timeline.title')} headingLevel={2}>
        <Timeline events={f.timeline} />
      </Card>

      {adding && <AddActionModal flag={f} onClose={() => setAdding(false)} />}
      {completing && (
        <CompleteActionModal action={completing} onClose={() => setCompleting(null)} />
      )}
    </div>
  );
}

function Timeline({ events }: { events: RiskTimelineEvent[] }) {
  const { t, i18n } = useTranslation('intervention');
  const lng = i18n.resolvedLanguage ?? 'en';
  const reasonText = useReasonText();
  const title = (e: RiskTimelineEvent) => {
    if (e.kind === 'LEVEL_CHANGED') {
      return t('timeline.LEVEL_CHANGED', {
        from: e.previousLevel ? t(`level.${e.previousLevel}`) : '',
        to: e.level ? t(`level.${e.level}`) : '',
      });
    }
    if (e.kind === 'OPENED') {
      return t('timeline.OPENED', { level: e.level ? t(`level.${e.level}`) : '' });
    }
    if (e.actionType) return t(`timeline.${e.kind}`, { type: t(`actionType.${e.actionType}`) });
    return t(`timeline.${e.kind}`);
  };
  return (
    <ol
      className="flex flex-col gap-3 border-l-2 border-slate-200 pl-4"
      data-testid="flag-timeline"
    >
      {events.map((e, i) => (
        <li key={`${e.at}-${i}`} className="text-sm">
          <p className="font-medium text-slate-900">{title(e)}</p>
          <p className="text-xs text-slate-600">
            {formatDate(e.at, lng, true)} · {e.by ?? t('timeline.system')}
          </p>
          {e.reasons && e.reasons.length > 0 && (
            <p className="mt-1 text-xs text-slate-700">{e.reasons.map(reasonText).join(' · ')}</p>
          )}
          {e.outcome && <p className="mt-1 text-xs text-slate-700">{e.outcome}</p>}
        </li>
      ))}
    </ol>
  );
}

function AddActionModal({ flag, onClose }: { flag: RiskFlagDetail; onClose: () => void }) {
  const { t } = useTranslation('intervention');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const add = useAddAction(flag.id);
  const noteId = useId();
  const [type, setType] = useState<InterventionActionType>('COUNSELLING');
  const [ownerId, setOwnerId] = useState(flag.ownerOptions[0]?.id ?? '');
  const [dueOn, setDueOn] = useState(todayIso());
  const [note, setNote] = useState('');

  const save = async () => {
    try {
      await add.mutateAsync({ type, ownerId, dueOn, note: note.trim() || undefined });
      toast.show({ tone: 'success', title: t('actions.added') });
      onClose();
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('actions.addTitle', { name: flag.student.fullName })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button loading={add.isPending} disabled={!ownerId} onClick={() => void save()}>
            {t('actions.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          label={t('actions.type')}
          value={type}
          onChange={(e) => setType(e.target.value as InterventionActionType)}
          options={INTERVENTION_ACTION_TYPES.map((v) => ({
            value: v,
            label: t(`actionType.${v}`),
          }))}
        />
        <Select
          label={t('actions.owner')}
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          options={flag.ownerOptions.map((o) => ({
            value: o.id,
            label: `${o.fullName} (${t(`role.${o.role}`)})`,
          }))}
        />
        <Input
          label={t('actions.due')}
          type="date"
          min={todayIso()}
          value={dueOn}
          onChange={(e) => setDueOn(e.target.value)}
        />
        <div>
          <label htmlFor={noteId} className="block text-sm font-medium text-slate-800">
            {t('actions.noteLabel')}
          </label>
          <p id={`${noteId}-hint`} className="text-xs text-slate-600">
            {t('actions.noteHint')}
          </p>
          <textarea
            id={noteId}
            rows={3}
            maxLength={1000}
            value={note}
            aria-describedby={`${noteId}-hint`}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-400 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          />
        </div>
      </div>
    </Modal>
  );
}

function CompleteActionModal({
  action,
  onClose,
}: {
  action: InterventionActionDto;
  onClose: () => void;
}) {
  const { t } = useTranslation('intervention');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const complete = useCompleteAction();
  const [outcome, setOutcome] = useState('');
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setInvalid(false), [outcome]);

  const save = async () => {
    if (outcome.trim().length < 3) return setInvalid(true);
    try {
      await complete.mutateAsync({ id: action.id, outcome: outcome.trim() });
      toast.show({ tone: 'success', title: t('actions.recorded') });
      onClose();
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('actions.recordTitle', { type: t(`actionType.${action.type}`) })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button loading={complete.isPending} onClick={() => void save()}>
            {t('actions.save')}
          </Button>
        </>
      }
    >
      <Input
        label={t('actions.outcome')}
        hint={t('actions.outcomeHint')}
        value={outcome}
        error={invalid ? t('actions.outcomeRequired') : undefined}
        onChange={(e) => setOutcome(e.target.value)}
      />
    </Modal>
  );
}
