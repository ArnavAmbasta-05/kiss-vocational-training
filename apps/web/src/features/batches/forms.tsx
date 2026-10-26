import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { DAYS_OF_WEEK, type AdminCourse, type BatchSummary, type DayOfWeek } from '@vtmp/shared';
import { Button, Input, Modal, Select, cn } from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { ApiError } from '../../lib/api/client';
import { formatSessionDate, formatSessionTime, institutionInstant } from '../../lib/format';
import { useScheduleCheck } from '../scheduling/api';
import { useCreateBatch, useCreateSessions, useUpdateBatch } from './api';

const BatchForm = z
  .object({
    courseId: z.string().uuid(),
    name: z.string().trim().min(1).max(60),
    capacity: z.coerce.number().int().min(1).max(500),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    venue: z.string().trim().min(2).max(120),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ['endDate'] });
type BatchValues = z.input<typeof BatchForm>;

export function BatchFormModal({
  open,
  cycleId,
  courses,
  batch,
  onClose,
}: {
  open: boolean;
  cycleId: string;
  courses: AdminCourse[];
  batch: BatchSummary | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('batches');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const create = useCreateBatch();
  const update = useUpdateBatch();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BatchValues>({ resolver: zodResolver(BatchForm) });

  useEffect(() => {
    if (!open) return;
    reset(
      batch
        ? { ...batch }
        : {
            courseId: courses.find((c) => c.isActive)?.id ?? '',
            name: '',
            capacity: 30,
            startDate: '',
            endDate: '',
            venue: '',
          },
    );
  }, [open, batch, courses, reset]);

  const onSubmit = handleSubmit(async (raw) => {
    const v = BatchForm.parse(raw);
    try {
      if (batch) {
        const { courseId: _c, ...fields } = v;
        await update.mutateAsync({ id: batch.id, ...fields });
        toast.show({ tone: 'success', title: t('form.saved') });
      } else {
        const created = await create.mutateAsync({ ...v, cycleId });
        toast.show({ tone: 'success', title: t('list.created', { name: created.name }) });
      }
      onClose();
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  });
  const err = (k: keyof BatchValues) => (errors[k] ? t('form.invalid') : undefined);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={batch ? t('form.editTitle') : t('form.title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('form.cancel')}
          </Button>
          <Button type="submit" form="batch-form" loading={isSubmitting}>
            {t('form.save')}
          </Button>
        </>
      }
    >
      <form
        id="batch-form"
        noValidate
        onSubmit={(e) => void onSubmit(e)}
        className="grid gap-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <Select
            label={t('fields.course')}
            disabled={!!batch}
            options={courses
              .filter((c) => c.isActive || c.id === batch?.courseId)
              .map((c) => ({ value: c.id, label: c.title }))}
            error={err('courseId')}
            {...register('courseId')}
          />
        </div>
        <Input label={t('fields.name')} required error={err('name')} {...register('name')} />
        <Input
          label={t('fields.capacity')}
          type="number"
          min={1}
          required
          error={err('capacity')}
          {...register('capacity')}
        />
        <Input
          label={t('fields.startDate')}
          type="date"
          required
          error={err('startDate')}
          {...register('startDate')}
        />
        <Input
          label={t('fields.endDate')}
          type="date"
          required
          error={err('endDate')}
          {...register('endDate')}
        />
        <div className="sm:col-span-2">
          <Input label={t('fields.venue')} required error={err('venue')} {...register('venue')} />
        </div>
      </form>
    </Modal>
  );
}

/** One session, or a weekly plan expanded on the server (times in IST). */
export function ScheduleModal({
  open,
  batch,
  onClose,
}: {
  open: boolean;
  batch: BatchSummary;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation('batches');
  const lng = i18n.resolvedLanguage ?? 'en';
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const create = useCreateSessions();
  const [kind, setKind] = useState<'single' | 'recurring'>('recurring');
  const [date, setDate] = useState(batch.startDate);
  const [from, setFrom] = useState(batch.startDate);
  const [until, setUntil] = useState(batch.endDate);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('12:00');
  const [days, setDays] = useState<Set<DayOfWeek>>(new Set(['MON', 'WED', 'FRI']));
  const [topic, setTopic] = useState('');
  const [venue, setVenue] = useState('');
  const [trainerId, setTrainerId] = useState('');
  const [clash, setClash] = useState<string | null>(null);
  const advise = useScheduleCheck();
  const resetAdvice = advise.reset;

  useEffect(() => {
    if (open) {
      setClash(null);
      resetAdvice();
      setDate(batch.startDate);
      setFrom(batch.startDate);
      setUntil(batch.endDate);
    }
  }, [open, batch, resetAdvice]);

  const toggleDay = (d: DayOfWeek) =>
    setDays((s) => {
      const n = new Set(s);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });

  const submit = async () => {
    const extra = {
      ...(topic.trim() ? { topic: topic.trim() } : {}),
      ...(venue.trim() ? { venue: venue.trim() } : {}),
      ...(trainerId ? { trainerId } : {}),
    };
    const input =
      kind === 'single'
        ? {
            kind,
            startsAt: institutionInstant(date, startTime),
            endsAt: institutionInstant(date, endTime),
            ...extra,
          }
        : {
            kind,
            daysOfWeek: DAYS_OF_WEEK.filter((d) => days.has(d)),
            startTime,
            endTime,
            from,
            until,
            ...extra,
          };
    setClash(null);
    advise.reset();
    try {
      const created = await create.mutateAsync({ batchId: batch.id, input });
      toast.show({ tone: 'success', title: t('sessions.created', { count: created.length }) });
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SCHEDULE_CLASH') {
        // BR-20: explain inline and, for a single session, suggest free times (BRQ-14.3).
        setClash(errorMessage(err));
        if (input.kind === 'single') {
          advise.mutate({
            batches: [
              {
                batchId: batch.id,
                sessions: [
                  {
                    startsAt: input.startsAt,
                    endsAt: input.endsAt,
                    ...(extra.venue ? { venue: extra.venue } : {}),
                    ...(extra.trainerId ? { trainerId: extra.trainerId } : {}),
                  },
                ],
              },
            ],
          });
        }
      } else {
        toast.show({ tone: 'error', title: errorMessage(err) });
      }
    }
  };

  const suggestions = advise.data?.batches[0]?.suggestions.slots ?? [];
  const pickSlot = (startsAt: string, endsAt: string) => {
    const hhmm = (iso: string) =>
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(iso));
    setDate(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(startsAt)),
    );
    setStartTime(hhmm(startsAt));
    setEndTime(hhmm(endsAt));
    setClash(null);
    advise.reset();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('sessions.scheduleTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('form.cancel')}
          </Button>
          <Button loading={create.isPending} onClick={() => void submit()}>
            {t('form.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium text-slate-800">{t('sessions.kind')}</legend>
          <div className="mt-1 flex gap-4">
            {(['recurring', 'single'] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />
                {t(`sessions.${k}`)}
              </label>
            ))}
          </div>
        </fieldset>
        {kind === 'single' ? (
          <div className="sm:col-span-2">
            <Input
              label={t('sessions.date')}
              type="date"
              value={date}
              min={batch.startDate}
              max={batch.endDate}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        ) : (
          <>
            <Input
              label={t('sessions.from')}
              type="date"
              value={from}
              min={batch.startDate}
              max={batch.endDate}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              label={t('sessions.until')}
              type="date"
              value={until}
              min={batch.startDate}
              max={batch.endDate}
              onChange={(e) => setUntil(e.target.value)}
            />
            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-medium text-slate-800">{t('sessions.days')}</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((d) => (
                  <label
                    key={d}
                    className={cn(
                      'flex items-center gap-1 rounded-md border px-2 py-1 text-sm',
                      days.has(d) ? 'border-brand-600 bg-brand-50' : 'border-slate-300',
                    )}
                  >
                    <input type="checkbox" checked={days.has(d)} onChange={() => toggleDay(d)} />
                    {t(`sessions.day.${d}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}
        <Input
          label={t('sessions.startTime')}
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
        <Input
          label={t('sessions.endTime')}
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
        />
        <Input
          label={t('sessions.topic')}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <Input
          label={t('sessions.venueOptional')}
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
        />
        <div className="sm:col-span-2">
          <Select
            label={t('sessions.trainer')}
            value={trainerId}
            onChange={(e) => setTrainerId(e.target.value)}
            options={[
              { value: '', label: t('sessions.anyTrainer') },
              ...batch.trainers.map((tr) => ({ value: tr.id, label: tr.fullName })),
            ]}
          />
        </div>
        <p className="text-xs text-slate-600 sm:col-span-2">{t('sessions.timeZoneNote')}</p>
        {clash && (
          <div
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 sm:col-span-2"
          >
            <p className="font-medium">{clash}</p>
            {suggestions.length > 0 && (
              <>
                <p className="mt-2">{t('sessions.freeSlots')}</p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <li key={s.startsAt}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => pickSlot(s.startsAt, s.endsAt)}
                      >
                        {formatSessionDate(s.startsAt, lng)} ·{' '}
                        {formatSessionTime(s.startsAt, s.endsAt, lng)}
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
