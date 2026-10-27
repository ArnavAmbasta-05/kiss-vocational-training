import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ROLES, type UserSummary } from '@vtmp/shared';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  PageSkeleton,
  Select,
  Table,
  type Column,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { useAuth } from '../../lib/auth';
import { useUpdateUser, useUsers, type UserFilters } from './api';
import { CreateUserModal } from './CreateUserModal';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function UsersPage() {
  const { t } = useTranslation(['users', 'common']);
  const { user: me } = useAuth();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<UserFilters>({ page: 1, q: '', role: '', isActive: '' });
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState<UserSummary | null>(null);
  const update = useUpdateUser();

  const q = useDebounced(search, 300);
  useEffect(() => setFilters((f) => ({ ...f, q, page: 1 })), [q]);

  const { data, isPending, isError, error, isFetching } = useUsers(filters);

  const setActive = async (target: UserSummary, isActive: boolean) => {
    try {
      await update.mutateAsync({ id: target.id, isActive });
      toast.show({
        tone: 'success',
        title: t(isActive ? 'reactivated' : 'deactivated', { name: target.fullName }),
      });
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    } finally {
      setConfirming(null);
    }
  };

  const status = (u: UserSummary) => {
    if (!u.isActive) return <Badge tone="neutral">{t('status.inactive')}</Badge>;
    if (u.lockedUntil && new Date(u.lockedUntil) > new Date()) {
      return <Badge tone="warning">{t('status.locked')}</Badge>;
    }
    return <Badge tone="success">{t('status.active')}</Badge>;
  };

  const columns: Column<UserSummary>[] = [
    {
      key: 'name',
      header: t('columns.name'),
      render: (u) => <span className="font-medium text-slate-900">{u.fullName}</span>,
    },
    { key: 'email', header: t('columns.email'), render: (u) => u.email },
    { key: 'role', header: t('columns.role'), render: (u) => t(`common:roles.${u.role}`) },
    { key: 'id', header: t('columns.id'), render: (u) => u.rollNo ?? u.employeeCode ?? '—' },
    { key: 'status', header: t('columns.status'), render: status },
    {
      key: 'actions',
      header: <span className="sr-only">{t('columns.actions')}</span>,
      align: 'right',
      render: (u) =>
        u.id === me?.id ? null : u.isActive ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setConfirming(u)}
            aria-label={`${t('deactivate')}: ${u.fullName}`}
          >
            {t('deactivate')}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void setActive(u, true)}
            aria-label={`${t('reactivate')}: ${u.fullName}`}
          >
            {t('reactivate')}
          </Button>
        ),
    },
  ];

  const meta = data?.meta;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-700">{t('intro')}</p>
        </div>
        <Button onClick={() => setCreating(true)}>{t('create')}</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Input
          label={t('search')}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          label={t('roleFilter')}
          value={filters.role}
          onChange={(e) =>
            setFilters((f) => ({ ...f, page: 1, role: e.target.value as UserFilters['role'] }))
          }
          options={[
            { value: '', label: t('allRoles') },
            ...ROLES.map((r) => ({ value: r, label: t(`common:roles.${r}`) })),
          ]}
        />
        <Select
          label={t('statusFilter')}
          value={filters.isActive}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              page: 1,
              isActive: e.target.value as UserFilters['isActive'],
            }))
          }
          options={[
            { value: '', label: t('allStatuses') },
            { value: 'true', label: t('status.active') },
            { value: 'false', label: t('status.inactive') },
          ]}
        />
      </div>

      {isPending ? (
        <PageSkeleton />
      ) : isError ? (
        <EmptyState title={errorMessage(error)} />
      ) : (
        <div aria-busy={isFetching} className="flex flex-col gap-3">
          <Table
            caption={t('caption')}
            columns={columns}
            rows={data.data}
            rowKey={(u) => u.id}
            empty={<EmptyState title={t('empty')} />}
          />
          {meta && meta.total > 0 && (
            <nav
              aria-label={t('pagination.label')}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <p className="text-slate-700">{t('pagination.summary', meta)}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={meta.page <= 1}
                  onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                >
                  {t('pagination.previous')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                >
                  {t('pagination.next')}
                </Button>
              </div>
            </nav>
          )}
        </div>
      )}

      <CreateUserModal open={creating} onClose={() => setCreating(false)} />

      <Modal
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title={t('confirmDeactivate.title', { name: confirming?.fullName ?? '' })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={update.isPending}
              onClick={() => confirming && void setActive(confirming, false)}
            >
              {t('confirmDeactivate.confirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">{t('confirmDeactivate.body')}</p>
      </Modal>
    </div>
  );
}
