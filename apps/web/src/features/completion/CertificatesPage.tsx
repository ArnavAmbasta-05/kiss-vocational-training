import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CERTIFICATE_STATUSES, type CertificateDto, type CertificateStatus } from '@vtmp/shared';
import {
  Badge,
  Button,
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
import { formatDate } from '../../lib/format';
import {
  downloadCertificate,
  useCertificates,
  useReissueCertificate,
  useRevokeCertificate,
} from './api';

const PAGE_SIZE = 20;

/** Admin: register of every certificate issued (BRQ-7.3), searchable. */
export function CertificatesPage() {
  const { t, i18n } = useTranslation('completion');
  const lng = i18n.resolvedLanguage ?? 'en';
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<CertificateStatus | ''>('');
  const [page, setPage] = useState(1);
  const list = useCertificates({ q, status: status || undefined, page, pageSize: PAGE_SIZE });
  const [action, setAction] = useState<{ kind: 'revoke' | 'reissue'; cert: CertificateDto } | null>(
    null,
  );

  // Search as you type, a moment after the last keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const columns: Column<CertificateDto>[] = [
    {
      key: 'code',
      header: t('register.code'),
      render: (c) => <span className="font-mono text-sm">{c.publicCode}</span>,
    },
    {
      key: 'student',
      header: t('register.student'),
      render: (c) => (
        <span>
          <span className="font-medium text-slate-900">{c.studentName}</span>
          <span className="block text-xs text-slate-600">{c.rollNo}</span>
        </span>
      ),
    },
    {
      key: 'course',
      header: t('register.course'),
      render: (c) => `${c.courseTitle} · ${c.batchName}`,
    },
    { key: 'grade', header: t('register.grade'), align: 'center', render: (c) => c.grade },
    { key: 'issued', header: t('register.issued'), render: (c) => formatDate(c.issuedAt, lng) },
    {
      key: 'status',
      header: t('register.status'),
      render: (c) => (
        <Badge
          tone={c.status === 'VALID' ? 'success' : c.status === 'REVOKED' ? 'danger' : 'neutral'}
        >
          {t(`certStatus.${c.status}`)}
        </Badge>
      ),
    },
    {
      key: 'pdf',
      header: t('register.pdf'),
      align: 'right',
      render: (c) =>
        c.rendered ? (
          <Button
            size="sm"
            variant="secondary"
            aria-label={t('queue.downloadFor', { name: c.studentName })}
            onClick={() =>
              void downloadCertificate(c.id, c.publicCode).catch((err: unknown) =>
                toast.show({ tone: 'error', title: errorMessage(err) }),
              )
            }
          >
            {t('queue.download')}
          </Button>
        ) : (
          <span className="text-xs text-slate-600">{t('register.notRendered')}</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('register.revoke')}</span>,
      align: 'right',
      render: (c) =>
        c.status === 'VALID' ? (
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('register.reissueFor', { code: c.publicCode })}
              onClick={() => setAction({ kind: 'reissue', cert: c })}
            >
              {t('register.reissue')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              aria-label={t('register.revokeFor', { code: c.publicCode })}
              onClick={() => setAction({ kind: 'revoke', cert: c })}
            >
              {t('register.revoke')}
            </Button>
          </div>
        ) : null,
    },
  ];

  const meta = list.data?.meta;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('register.title')}</h1>
        <p className="mt-1 text-sm text-slate-700">{t('register.intro')}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-96 max-w-full">
          <Input
            label={t('register.search')}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-48">
          <Select
            label={t('register.status')}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as CertificateStatus | '');
              setPage(1);
            }}
            options={[
              { value: '', label: t('register.anyStatus') },
              ...CERTIFICATE_STATUSES.map((s) => ({ value: s, label: t(`certStatus.${s}`) })),
            ]}
          />
        </div>
      </div>
      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <EmptyState title={errorMessage(list.error)} />
      ) : (
        <Table
          caption={t('register.caption')}
          columns={columns}
          rows={list.data.data}
          rowKey={(c) => c.id}
          empty={<EmptyState title={t('register.empty')} />}
        />
      )}
      {meta && meta.totalPages > 1 && (
        <nav className="flex items-center gap-3" aria-label={t('register.caption')}>
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t('register.previous')}
          </Button>
          <span className="text-sm text-slate-700">
            {t('register.page', { page: meta.page, pages: meta.totalPages })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('register.next')}
          </Button>
        </nav>
      )}
      <CertificateAction action={action} onClose={() => setAction(null)} />
    </div>
  );
}

/** Revoke (with a reason) or reissue a valid certificate, after confirmation (BRQ-15.4, BR-19). */
function CertificateAction({
  action,
  onClose,
}: {
  action: { kind: 'revoke' | 'reissue'; cert: CertificateDto } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('completion');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const revoke = useRevokeCertificate();
  const reissue = useReissueCertificate();
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setReason('');
    setInvalid(false);
  }, [action]);

  if (!action) return null;
  const code = action.cert.publicCode;
  const isRevoke = action.kind === 'revoke';

  const confirm = async () => {
    try {
      if (isRevoke) {
        if (reason.trim().length < 3) return setInvalid(true);
        await revoke.mutateAsync({ id: action.cert.id, reason: reason.trim() });
        toast.show({ tone: 'success', title: t('register.revoked') });
      } else {
        const fresh = await reissue.mutateAsync(action.cert.id);
        toast.show({ tone: 'success', title: t('register.reissued', { code: fresh.publicCode }) });
      }
      onClose();
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isRevoke ? t('register.revokeTitle', { code }) : t('register.reissueTitle', { code })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('register.cancel')}
          </Button>
          <Button
            variant={isRevoke ? 'danger' : 'primary'}
            loading={revoke.isPending || reissue.isPending}
            onClick={() => void confirm()}
          >
            {t('register.confirm')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-700">
        {isRevoke ? t('register.revokeBody') : t('register.reissueBody')}
      </p>
      {isRevoke && (
        <div className="mt-4">
          <Input
            label={t('register.reason')}
            value={reason}
            error={invalid ? t('register.reasonRequired') : undefined}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      )}
    </Modal>
  );
}
