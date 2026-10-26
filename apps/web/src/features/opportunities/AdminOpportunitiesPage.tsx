import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  OPPORTUNITY_TYPES,
  type JobRoleDto,
  type OpportunityDto,
  type OpportunityListQuery,
  type OpportunityType,
} from '@vtmp/shared';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  Select,
  Spinner,
  Table,
  Tabs,
  type Column,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { formatDay } from '../../lib/format';
import {
  downloadInterestedCsv,
  useInterested,
  useJobRoles,
  useOpportunities,
  useSaveOpportunity,
  useSaveRole,
} from './api';

/** Admin: job roles (BRQ-C.3) and opportunities with interested students (BRQ-13.1, 13.4). */
export function AdminOpportunitiesPage() {
  const { t } = useTranslation('opportunities');
  const [tab, setTab] = useState('opportunities');
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('admin.title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-700">{t('admin.intro')}</p>
      </div>
      <Tabs
        label={t('admin.tabs')}
        selected={tab}
        onSelect={setTab}
        items={[
          { id: 'opportunities', label: t('admin.opportunities'), content: <OpportunitiesTab /> },
          { id: 'roles', label: t('admin.roles'), content: <RolesTab /> },
        ]}
      />
    </div>
  );
}

function OpportunitiesTab() {
  const { t, i18n } = useTranslation('opportunities');
  const lng = i18n.resolvedLanguage ?? 'en';
  const errorMessage = useErrorMessage();
  const [status, setStatus] = useState<OpportunityListQuery['status']>('OPEN');
  const [page, setPage] = useState(1);
  const list = useOpportunities({ status, page, pageSize: 20 });
  const roles = useJobRoles();
  const [editing, setEditing] = useState<OpportunityDto | 'new' | null>(null);
  const [viewing, setViewing] = useState<OpportunityDto | null>(null);

  const columns: Column<OpportunityDto>[] = [
    {
      key: 'title',
      header: t('fields.title'),
      render: (o) => (
        <span>
          <span className="font-medium text-slate-900">{o.title}</span>
          <span className="block text-xs text-slate-600">
            {o.partner} · {o.role.title}
          </span>
        </span>
      ),
    },
    { key: 'type', header: t('fields.type'), render: (o) => t(`type.${o.type}`) },
    { key: 'closes', header: t('fields.closesOn'), render: (o) => formatDay(o.closesOn, lng) },
    {
      key: 'status',
      header: t('fields.status'),
      render: (o) => (
        <Badge tone={o.isOpen ? 'success' : 'neutral'}>{o.isOpen ? t('open') : t('closed')}</Badge>
      ),
    },
    {
      key: 'interested',
      header: t('fields.interested'),
      align: 'center',
      render: (o) => (
        <Button
          size="sm"
          variant="ghost"
          aria-label={t('admin.viewInterested', { title: o.title })}
          onClick={() => setViewing(o)}
        >
          {o.interestedCount}
        </Button>
      ),
    },
    {
      key: 'edit',
      header: <span className="sr-only">{t('admin.edit')}</span>,
      align: 'right',
      render: (o) => (
        <Button
          size="sm"
          variant="secondary"
          aria-label={t('admin.editFor', { title: o.title })}
          onClick={() => setEditing(o)}
        >
          {t('admin.edit')}
        </Button>
      ),
    },
  ];

  const meta = list.data?.meta;
  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-40">
          <Select
            label={t('fields.status')}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as OpportunityListQuery['status']);
              setPage(1);
            }}
            options={(['OPEN', 'CLOSED', 'ALL'] as const).map((s) => ({
              value: s,
              label: t(`status.${s}`),
            }))}
          />
        </div>
        <Button disabled={!roles.data?.length} onClick={() => setEditing('new')}>
          {t('admin.newOpportunity')}
        </Button>
      </div>
      {roles.data && roles.data.length === 0 && (
        <p className="text-sm text-slate-700">{t('admin.needRole')}</p>
      )}
      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <EmptyState title={errorMessage(list.error)} />
      ) : (
        <Table
          caption={t('admin.opportunities')}
          columns={columns}
          rows={list.data.data}
          rowKey={(o) => o.id}
          empty={<EmptyState title={t('admin.noOpportunities')} />}
        />
      )}
      {meta && meta.totalPages > 1 && (
        <nav className="flex items-center gap-3" aria-label={t('admin.opportunities')}>
          <Button
            size="sm"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t('previous')}
          </Button>
          <span className="text-sm text-slate-700">
            {t('page', { page: meta.page, pages: meta.totalPages })}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('next')}
          </Button>
        </nav>
      )}
      {editing && (
        <OpportunityForm
          opportunity={editing === 'new' ? null : editing}
          roles={roles.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
      {viewing && <InterestedModal opportunity={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function OpportunityForm({
  opportunity: o,
  roles,
  onClose,
}: {
  opportunity: OpportunityDto | null;
  roles: JobRoleDto[];
  onClose: () => void;
}) {
  const { t } = useTranslation('opportunities');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const save = useSaveOpportunity();
  const [form, setForm] = useState({
    roleId: o?.role.id ?? roles[0]?.id ?? '',
    title: o?.title ?? '',
    type: (o?.type ?? 'APPRENTICESHIP') as OpportunityType,
    partner: o?.partner ?? '',
    location: o?.location ?? '',
    description: o?.description ?? '',
    closesOn: o?.closesOn ?? '',
    isActive: o?.isActive ?? true,
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    try {
      await save.mutateAsync({
        id: o?.id,
        input: {
          ...form,
          title: form.title.trim(),
          partner: form.partner.trim(),
          location: form.location.trim() || undefined,
          description: form.description.trim() || undefined,
        },
      });
      toast.show({ tone: 'success', title: t('admin.saved') });
      onClose();
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={o ? t('admin.editTitle') : t('admin.newOpportunity')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button loading={save.isPending} onClick={() => void submit()}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            label={t('fields.title')}
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </div>
        <Select
          label={t('fields.role')}
          value={form.roleId}
          onChange={(e) => set({ roleId: e.target.value })}
          options={roles.map((r) => ({ value: r.id, label: r.title }))}
        />
        <Select
          label={t('fields.type')}
          value={form.type}
          onChange={(e) => set({ type: e.target.value as OpportunityType })}
          options={OPPORTUNITY_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }))}
        />
        <Input
          label={t('fields.partner')}
          value={form.partner}
          onChange={(e) => set({ partner: e.target.value })}
        />
        <Input
          label={t('fields.location')}
          value={form.location}
          onChange={(e) => set({ location: e.target.value })}
        />
        <Input
          label={t('fields.closesOn')}
          type="date"
          value={form.closesOn}
          onChange={(e) => set({ closesOn: e.target.value })}
        />
        <label className="flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set({ isActive: e.target.checked })}
          />
          {t('fields.active')}
        </label>
        <div className="sm:col-span-2">
          <Input
            label={t('fields.description')}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </div>
      </div>
    </Modal>
  );
}

function InterestedModal({
  opportunity: o,
  onClose,
}: {
  opportunity: OpportunityDto;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation('opportunities');
  const lng = i18n.resolvedLanguage ?? 'en';
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const list = useInterested(o.id);
  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.interestedTitle', { title: o.title })}
      footer={
        <>
          <Button
            variant="secondary"
            disabled={!list.data?.length}
            onClick={() =>
              void downloadInterestedCsv(o.id).catch((err: unknown) =>
                toast.show({ tone: 'error', title: errorMessage(err) }),
              )
            }
          >
            {t('admin.exportCsv')}
          </Button>
          <Button onClick={onClose}>{t('close')}</Button>
        </>
      }
    >
      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <EmptyState title={errorMessage(list.error)} />
      ) : list.data.length === 0 ? (
        <EmptyState title={t('admin.noInterest')} />
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {list.data.map((s) => (
            <li key={s.studentId} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span className="font-medium text-slate-900">{s.fullName}</span>
                <span className="block text-xs text-slate-600">
                  {s.rollNo} · {s.email} · {formatDay(s.interestedAt.slice(0, 10), lng)}
                </span>
              </span>
              <Badge
                tone={
                  s.matchPercent >= 75 ? 'success' : s.matchPercent >= 40 ? 'warning' : 'neutral'
                }
              >
                {t('match', { percent: Math.round(s.matchPercent) })}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function RolesTab() {
  const { t } = useTranslation('opportunities');
  const errorMessage = useErrorMessage();
  const roles = useJobRoles();
  const [editing, setEditing] = useState<JobRoleDto | 'new' | null>(null);
  const columns: Column<JobRoleDto>[] = [
    {
      key: 'title',
      header: t('fields.role'),
      render: (r) => (
        <span>
          <span className="font-medium text-slate-900">{r.title}</span>
          {!r.isActive && <Badge className="ml-2">{t('inactive')}</Badge>}
        </span>
      ),
    },
    {
      key: 'skills',
      header: t('fields.competencies'),
      render: (r) =>
        r.competencies
          .map((c) => `${c.title ?? c.code} (${t('levelShort', { level: c.level })})`)
          .join(', '),
    },
    {
      key: 'count',
      header: t('fields.opportunities'),
      align: 'center',
      render: (r) => r.opportunityCount,
    },
    {
      key: 'edit',
      header: <span className="sr-only">{t('admin.edit')}</span>,
      align: 'right',
      render: (r) => (
        <Button
          size="sm"
          variant="secondary"
          aria-label={t('admin.editFor', { title: r.title })}
          onClick={() => setEditing(r)}
        >
          {t('admin.edit')}
        </Button>
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>{t('admin.newRole')}</Button>
      </div>
      {roles.isPending ? (
        <Spinner />
      ) : roles.isError ? (
        <EmptyState title={errorMessage(roles.error)} />
      ) : (
        <Table
          caption={t('admin.roles')}
          columns={columns}
          rows={roles.data}
          rowKey={(r) => r.id}
          empty={<EmptyState title={t('admin.noRoles')} />}
        />
      )}
      {editing && (
        <RoleForm role={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function RoleForm({ role, onClose }: { role: JobRoleDto | null; onClose: () => void }) {
  const { t } = useTranslation('opportunities');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const save = useSaveRole();
  const [title, setTitle] = useState(role?.title ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [isActive, setIsActive] = useState(role?.isActive ?? true);
  const [rows, setRows] = useState<Array<{ code: string; level: number }>>(
    role?.competencies.map((c) => ({ code: c.code, level: c.level })) ?? [{ code: '', level: 3 }],
  );

  const submit = async () => {
    try {
      await save.mutateAsync({
        id: role?.id,
        input: {
          title: title.trim(),
          description: description.trim() || undefined,
          isActive,
          competencies: rows
            .filter((r) => r.code.trim())
            .map((r) => ({ code: r.code.trim(), level: r.level })),
        },
      });
      toast.show({ tone: 'success', title: t('admin.saved') });
      onClose();
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={role ? t('admin.editRole') : t('admin.newRole')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button loading={save.isPending} onClick={() => void submit()}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label={t('fields.role')} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input
          label={t('fields.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          {t('fields.active')}
        </label>
        <fieldset>
          <legend className="text-sm font-medium text-slate-800">{t('fields.competencies')}</legend>
          <p className="text-xs text-slate-600">{t('admin.codesHint')}</p>
          <div className="mt-2 flex flex-col gap-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label={t('admin.code', { n: i + 1 })}
                    value={r.code}
                    onChange={(e) =>
                      setRows((rs) =>
                        rs.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)),
                      )
                    }
                  />
                </div>
                <div className="w-32">
                  <Select
                    label={t('admin.level', { n: i + 1 })}
                    value={String(r.level)}
                    onChange={(e) =>
                      setRows((rs) =>
                        rs.map((x, j) => (j === i ? { ...x, level: Number(e.target.value) } : x)),
                      )
                    }
                    options={[1, 2, 3, 4].map((l) => ({ value: String(l), label: String(l) }))}
                  />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('admin.removeRow', { n: i + 1 })}
                  disabled={rows.length <= 1}
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                >
                  {t('admin.remove')}
                </Button>
              </div>
            ))}
          </div>
          <Button
            className="mt-2"
            size="sm"
            variant="secondary"
            onClick={() => setRows((rs) => [...rs, { code: '', level: 3 }])}
          >
            {t('admin.addRow')}
          </Button>
        </fieldset>
      </div>
    </Modal>
  );
}
