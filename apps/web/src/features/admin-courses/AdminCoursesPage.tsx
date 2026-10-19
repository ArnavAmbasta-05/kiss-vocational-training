import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminCourse, Offering } from '@vtmp/shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Select,
  Spinner,
  Table,
  type Column,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { formatDate, formatDay } from '../../lib/format';
import { WindowBadge } from '../catalogue/WindowBadge';
import { useAdminCourses, useAdminCycles, useOfferings, useUpdateCourse } from './api';
import { CourseFormModal, CycleFormModal, WindowFormModal } from './forms';

/** Admin: courses (BRQ-2.1) and cycles with per-course enrollment windows (BRQ-2.3). */
export function AdminCoursesPage() {
  const { t } = useTranslation('courses');
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('admin.title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-700">{t('admin.intro')}</p>
      </div>
      <CoursesSection />
      <CyclesSection />
    </div>
  );
}

function CoursesSection() {
  const { t } = useTranslation('courses');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { data, isPending, isError, error } = useAdminCourses();
  const update = useUpdateCourse();
  const [editing, setEditing] = useState<AdminCourse | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const toggle = async (c: AdminCourse) => {
    try {
      await update.mutateAsync({ id: c.id, isActive: !c.isActive });
      toast.show({
        tone: 'success',
        title: t(c.isActive ? 'admin.courseDeactivated' : 'admin.courseReactivated', {
          title: c.title,
        }),
      });
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };

  const columns: Column<AdminCourse>[] = [
    {
      key: 'code',
      header: t('fields.code'),
      render: (c) => <span className="font-mono">{c.code}</span>,
    },
    {
      key: 'title',
      header: t('fields.title'),
      render: (c) => <span className="font-medium">{c.title}</span>,
    },
    {
      key: 'duration',
      header: t('fields.duration'),
      render: (c) => t('fields.durationValue', { count: c.durationWeeks }),
    },
    {
      key: 'seats',
      header: t('fields.seatCapacity'),
      align: 'right',
      render: (c) => c.seatCapacity,
    },
    {
      key: 'status',
      header: t('fields.status'),
      render: (c) => (
        <Badge tone={c.isActive ? 'success' : 'neutral'}>
          {c.isActive ? t('admin.active') : t('admin.inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('fields.status')}</span>,
      align: 'right',
      render: (c) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setEditing(c);
              setFormOpen(true);
            }}
            aria-label={t('admin.editCourseFor', { title: c.title })}
          >
            {t('admin.editCourse')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void toggle(c)}
            aria-label={`${c.isActive ? t('admin.deactivate') : t('admin.reactivate')}: ${c.title}`}
          >
            {c.isActive ? t('admin.deactivate') : t('admin.reactivate')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Card
      title={t('admin.coursesHeading')}
      actions={
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          {t('admin.addCourse')}
        </Button>
      }
    >
      {isPending ? (
        <Spinner />
      ) : isError ? (
        <EmptyState title={errorMessage(error)} />
      ) : (
        <Table
          caption={t('admin.coursesCaption')}
          columns={columns}
          rows={data}
          rowKey={(c) => c.id}
        />
      )}
      <CourseFormModal open={formOpen} course={editing} onClose={() => setFormOpen(false)} />
    </Card>
  );
}

function CyclesSection() {
  const { t, i18n } = useTranslation('courses');
  const lng = i18n.resolvedLanguage ?? 'en';
  const errorMessage = useErrorMessage();
  const cycles = useAdminCycles();
  const [cycleId, setCycleId] = useState<string>();
  const [cycleFormOpen, setCycleFormOpen] = useState(false);
  const [target, setTarget] = useState<{ course: AdminCourse; offering: Offering | null } | null>(
    null,
  );
  const offerings = useOfferings(cycleId);

  useEffect(() => {
    if (!cycleId && cycles.data?.[0]) setCycleId(cycles.data[0].id);
  }, [cycleId, cycles.data]);

  const cycle = cycles.data?.find((c) => c.id === cycleId);
  type Row = { course: AdminCourse; offering: Offering | null };
  const columns: Column<Row>[] = [
    {
      key: 'course',
      header: t('fields.title'),
      render: (r) => <span className="font-medium">{r.course.title}</span>,
    },
    {
      key: 'state',
      header: t('fields.window'),
      render: (r) => <WindowBadge offering={r.offering} />,
    },
    {
      key: 'dates',
      header: t('admin.opensAt'),
      render: (r) =>
        r.offering
          ? t('window.range', {
              from: formatDate(r.offering.enrollmentOpensAt, lng, true),
              to: formatDate(r.offering.enrollmentClosesAt, lng, true),
            })
          : '—',
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('admin.editWindow')}</span>,
      align: 'right',
      render: (r) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setTarget(r)}
          aria-label={t('admin.editWindowFor', { title: r.course.title })}
        >
          {r.offering ? t('admin.editWindow') : t('admin.offer')}
        </Button>
      ),
    },
  ];

  return (
    <Card
      title={t('admin.cyclesHeading')}
      actions={
        <Button size="sm" onClick={() => setCycleFormOpen(true)}>
          {t('admin.addCycle')}
        </Button>
      }
    >
      {cycles.isPending ? (
        <Spinner />
      ) : cycles.isError ? (
        <EmptyState title={errorMessage(cycles.error)} />
      ) : cycles.data.length === 0 ? (
        <EmptyState title={t('admin.noCycles')} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 sm:max-w-sm">
            <Select
              label={t('admin.selectCycle')}
              value={cycleId}
              onChange={(e) => setCycleId(e.target.value)}
              options={cycles.data.map((c) => ({ value: c.id, label: c.name }))}
            />
            {cycle && (
              <p className="text-xs text-slate-600">
                {t('window.range', {
                  from: formatDay(cycle.startsOn, lng),
                  to: formatDay(cycle.endsOn, lng),
                })}
              </p>
            )}
          </div>
          {offerings.isPending ? (
            <Spinner />
          ) : offerings.isError ? (
            <EmptyState title={errorMessage(offerings.error)} />
          ) : (
            <Table
              caption={t('admin.offeringsCaption')}
              columns={columns}
              rows={offerings.data.filter((r) => r.course.isActive || r.offering)}
              rowKey={(r) => r.course.id}
            />
          )}
        </div>
      )}
      <CycleFormModal
        open={cycleFormOpen}
        onClose={() => setCycleFormOpen(false)}
        onCreated={setCycleId}
      />
      {cycleId && (
        <WindowFormModal target={target} cycleId={cycleId} onClose={() => setTarget(null)} />
      )}
    </Card>
  );
}
