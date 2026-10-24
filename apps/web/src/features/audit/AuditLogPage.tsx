import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuditLogRow } from '@vtmp/shared';
import { Badge, Button, EmptyState, Input, Select, Spinner } from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { formatDate } from '../../lib/format';
import { downloadAuditCsv, useAuditFacets, useAuditLogs } from './api';

const PAGE_SIZE = 25;

interface Filters {
  userId?: string;
  entity?: string;
  entityId?: string;
  action?: string;
  from?: string;
  to?: string;
}

/**
 * Admin: the audit trail (F19, BRQ-19.2), newest first, filtered by user, entity, record,
 * action and date, with an old → new view of each change. Read-only (BRQ-19.3).
 */
export function AuditLogPage() {
  const { t, i18n } = useTranslation('audit');
  const lng = i18n.resolvedLanguage ?? 'en';
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const facets = useAuditFacets();
  const [filters, setFilters] = useState<Filters>({});
  const [userName, setUserName] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const list = useAuditLogs(filters, page, PAGE_SIZE);

  const set = (patch: Filters) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const onExport = async () => {
    setExporting(true);
    try {
      await downloadAuditCsv(filters);
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    } finally {
      setExporting(false);
    }
  };

  const meta = list.data?.meta;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-700">{t('intro')}</p>
        </div>
        <Button variant="secondary" loading={exporting} onClick={() => void onExport()}>
          {t('export')}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Select
          label={t('filters.entity')}
          value={filters.entity ?? ''}
          onChange={(e) => set({ entity: e.target.value || undefined })}
          options={[
            { value: '', label: t('filters.any') },
            ...(facets.data?.entities ?? []).map((v) => ({ value: v, label: v })),
          ]}
        />
        <Select
          label={t('filters.action')}
          value={filters.action ?? ''}
          onChange={(e) => set({ action: e.target.value || undefined })}
          options={[
            { value: '', label: t('filters.any') },
            ...(facets.data?.actions ?? []).map((v) => ({ value: v, label: v })),
          ]}
        />
        <Input
          label={t('filters.entityId')}
          value={filters.entityId ?? ''}
          onChange={(e) => set({ entityId: e.target.value.trim() || undefined })}
        />
        <Input
          label={t('filters.from')}
          type="date"
          value={filters.from ?? ''}
          onChange={(e) => set({ from: e.target.value || undefined })}
        />
        <Input
          label={t('filters.to')}
          type="date"
          value={filters.to ?? ''}
          onChange={(e) => set({ to: e.target.value || undefined })}
        />
        {filters.userId && (
          <div className="flex items-end gap-2">
            <p className="text-sm text-slate-800">{t('filters.user', { name: userName })}</p>
            <Button size="sm" variant="ghost" onClick={() => set({ userId: undefined })}>
              {t('filters.clearUser')}
            </Button>
          </div>
        )}
      </div>

      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <EmptyState title={errorMessage(list.error)} />
      ) : list.data.data.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <div
          role="region"
          aria-label={t('caption')}
          className="relative overflow-x-auto rounded-lg border border-slate-200"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable regions must be keyboard-reachable
          tabIndex={0}
        >
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <caption className="sr-only">{t('caption')}</caption>
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-700">
                  {t('cols.time')}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-700">
                  {t('cols.user')}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-700">
                  {t('cols.action')}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-700">
                  {t('cols.record')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold text-slate-700">
                  <span className="sr-only">{t('cols.changes')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {list.data.data.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-800">
                      {formatDate(r.createdAt, lng, true)}
                    </td>
                    <td className="px-3 py-2 text-slate-800">
                      {r.user ? (
                        <button
                          type="button"
                          className="text-left text-brand-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                          aria-label={t('filterByUser', { name: r.user.fullName })}
                          onClick={() => {
                            setUserName(r.user!.fullName);
                            set({ userId: r.user!.id });
                          }}
                        >
                          {r.user.fullName}
                          <span className="block text-xs text-slate-600">{r.user.email}</span>
                        </button>
                      ) : (
                        <Badge>{t('system')}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-800">{r.action}</td>
                    <td className="px-3 py-2 text-slate-800">
                      {r.entity}
                      <span className="block break-all font-mono text-xs text-slate-600">
                        {r.entityId}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-expanded={open === r.id}
                        aria-controls={`diff-${r.id}`}
                        onClick={() => setOpen(open === r.id ? null : r.id)}
                      >
                        {open === r.id ? t('hide') : t('show')}
                      </Button>
                    </td>
                  </tr>
                  {open === r.id && (
                    <tr id={`diff-${r.id}`}>
                      <td colSpan={5} className="bg-slate-50 px-3 py-3">
                        <Diff row={r} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && (
        <nav className="flex flex-wrap items-center gap-3" aria-label={t('pages')}>
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t('previous')}
          </Button>
          <span className="text-sm text-slate-700">
            {t('page', { page: meta.page, pages: meta.totalPages, total: meta.total })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('next')}
          </Button>
        </nav>
      )}
    </div>
  );
}

const show = (v: unknown) =>
  v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v, null, 1);

/** Old → new for each top-level field; changed fields are marked in text, not colour alone. */
function Diff({ row }: { row: AuditLogRow }) {
  const { t } = useTranslation('audit');
  const asObject = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const oldV = asObject(row.oldValue);
  const newV = asObject(row.newValue);
  const keys = [...new Set([...Object.keys(oldV), ...Object.keys(newV)])];
  if (keys.length === 0) return <p className="text-sm text-slate-700">{t('noValues')}</p>;

  return (
    <table className="w-full text-xs">
      <caption className="sr-only">{t('diffCaption')}</caption>
      <thead>
        <tr>
          <th scope="col" className="px-2 py-1 text-left font-semibold text-slate-700">
            {t('field')}
          </th>
          <th scope="col" className="px-2 py-1 text-left font-semibold text-slate-700">
            {t('old')}
          </th>
          <th scope="col" className="px-2 py-1 text-left font-semibold text-slate-700">
            {t('new')}
          </th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => {
          const changed = JSON.stringify(oldV[k]) !== JSON.stringify(newV[k]);
          return (
            <tr key={k} className={changed ? 'bg-amber-50' : undefined}>
              <th scope="row" className="px-2 py-1 text-left align-top font-mono text-slate-800">
                {k}
                {changed && <span className="ml-1 text-amber-900">({t('changed')})</span>}
              </th>
              <td className="px-2 py-1 align-top">
                <pre className="whitespace-pre-wrap break-all font-mono text-slate-700">
                  {show(oldV[k])}
                </pre>
              </td>
              <td className="px-2 py-1 align-top">
                <pre className="whitespace-pre-wrap break-all font-mono text-slate-900">
                  {show(newV[k])}
                </pre>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
