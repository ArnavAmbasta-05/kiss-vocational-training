import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import type { Passport, PassportEntry, PassportShareCreated, PassportShareDto } from '@vtmp/shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  Select,
  Spinner,
  Table,
  Tabs,
  type Column,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { formatDate, formatDay } from '../../lib/format';
import { openEvidence } from '../evidence/api';
import {
  downloadPassportPdf,
  useCreateShare,
  useMyPassport,
  useMyShares,
  useRevokeShare,
} from './api';

/** Student: Skill Passport (F10) — verified skills, certificates, sharing and PDF. */
export function MyPassportPage() {
  const { t } = useTranslation(['passport', 'competency']);
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const passport = useMyPassport();
  const [tab, setTab] = useState('practical');
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);

  if (passport.isPending) return <Spinner size="lg" />;
  if (passport.isError) return <EmptyState title={errorMessage(passport.error)} />;
  const p = passport.data;

  const onPdf = async () => {
    setBusy(true);
    try {
      await downloadPassportPdf(p.student.rollNo);
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-700">{t('intro')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" loading={busy} onClick={() => void onPdf()}>
            {t('download')}
          </Button>
          <Button onClick={() => setSharing(true)}>{t('share')}</Button>
        </div>
      </div>

      <Tabs
        label={t('tabsLabel')}
        selected={tab}
        onSelect={setTab}
        items={[
          {
            id: 'practical',
            label: `${t('practical')} (${p.practical.length})`,
            content: <SkillList items={p.practical} />,
          },
          {
            id: 'theory',
            label: `${t('theory')} (${p.theory.length})`,
            content: <SkillList items={p.theory} />,
          },
        ]}
      />

      {p.revoked.length > 0 && (
        <Card title={t('revokedTitle')} headingLevel={2}>
          <ul className="flex flex-col gap-1 text-sm text-slate-700">
            {p.revoked.map((r) => (
              <li key={r.ratingId}>
                {t('revokedBody', { title: r.title, reason: r.revokedReason })}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Certificates certificates={p.certificates} />
      <Shares />
      <ShareModal open={sharing} onClose={() => setSharing(false)} />
    </div>
  );
}

function SkillList({ items }: { items: PassportEntry[] }) {
  const { t, i18n } = useTranslation(['passport', 'competency']);
  const lng = i18n.resolvedLanguage ?? 'en';
  const toast = useToast();
  const errorMessage = useErrorMessage();
  if (items.length === 0) return <EmptyState title={t('noSkills')} />;
  return (
    <ul className="grid gap-3 sm:grid-cols-2" data-testid="passport-skills">
      {items.map((e) => (
        <li key={e.ratingId} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone="success">✓ {t('competency:verified')}</Badge>
            <span className="text-sm font-semibold text-slate-900">
              {t(`competency:level.${e.level}`)}
            </span>
          </p>
          <p className="mt-2 font-medium text-slate-900">{e.title}</p>
          <p className="text-xs text-slate-600">
            {t('course', { course: e.courseTitle, batch: e.batchName })}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {t('verifiedOn', { date: formatDate(e.verifiedAt, lng), name: e.verifiedBy })}
          </p>
          {e.evidence && e.evidence.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-slate-700">{t('evidence')}</p>
              <ul className="mt-1 flex flex-wrap gap-1">
                {e.evidence.map((ev) => (
                  <li key={ev.id}>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('openEvidence', { name: ev.label, skill: e.title })}
                      onClick={() =>
                        void openEvidence(ev.id).catch((err: unknown) =>
                          toast.show({ tone: 'error', title: errorMessage(err) }),
                        )
                      }
                    >
                      {ev.kind === 'LINK' ? t('videoLink') : ev.label}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Certificates({ certificates }: { certificates: Passport['certificates'] }) {
  const { t, i18n } = useTranslation(['passport', 'completion']);
  const lng = i18n.resolvedLanguage ?? 'en';
  return (
    <Card title={t('certificates')} headingLevel={2}>
      {certificates.length === 0 ? (
        <p className="text-sm text-slate-700">{t('noCertificates')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {certificates.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"
            >
              <span>
                <span className="font-medium text-slate-900">{c.courseTitle}</span>
                <span className="block text-xs text-slate-600">
                  {t('public.grade', { grade: c.grade })} ·{' '}
                  {formatDay(c.issuedAt.slice(0, 10), lng)} ·{' '}
                  <span className="font-mono">{c.publicCode}</span>
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Badge
                  tone={
                    c.status === 'VALID' ? 'success' : c.status === 'REVOKED' ? 'danger' : 'neutral'
                  }
                >
                  {t(`completion:certStatus.${c.status}`)}
                </Badge>
                <a
                  href={`/verify/${c.publicCode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('verifyLinkFor', { code: c.publicCode })}
                  className="text-sm font-medium text-brand-700 underline hover:text-brand-900"
                >
                  {t('verifyLink')}
                </a>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Shares() {
  const { t, i18n } = useTranslation('passport');
  const lng = i18n.resolvedLanguage ?? 'en';
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const shares = useMyShares();
  const revoke = useRevokeShare();

  const columns: Column<PassportShareDto>[] = [
    { key: 'created', header: t('createdOn'), render: (s) => formatDate(s.createdAt, lng) },
    {
      key: 'expires',
      header: t('expiresOn'),
      render: (s) => (s.expiresAt ? formatDate(s.expiresAt, lng) : '—'),
    },
    { key: 'views', header: t('views'), align: 'right', render: (s) => s.viewCount },
    {
      key: 'status',
      header: t('status'),
      render: (s) => (
        <Badge tone={s.active ? 'success' : 'neutral'}>
          {s.active ? t('active') : t('inactive')}
        </Badge>
      ),
    },
    {
      key: 'act',
      header: <span className="sr-only">{t('revoke')}</span>,
      align: 'right',
      render: (s) =>
        s.active ? (
          <Button
            size="sm"
            variant="secondary"
            aria-label={t('revokeFor', { date: formatDate(s.createdAt, lng) })}
            onClick={() =>
              void revoke
                .mutateAsync(s.id)
                .then(() => toast.show({ tone: 'success', title: t('revoked') }))
                .catch((err: unknown) => toast.show({ tone: 'error', title: errorMessage(err) }))
            }
          >
            {t('revoke')}
          </Button>
        ) : null,
    },
  ];

  return (
    <Card title={t('shares')} headingLevel={2}>
      {shares.isPending ? (
        <Spinner />
      ) : (
        <Table
          caption={t('sharesCaption')}
          columns={columns}
          rows={shares.data ?? []}
          rowKey={(s) => s.id}
          empty={<p className="text-sm text-slate-700">{t('noShares')}</p>}
        />
      )}
    </Card>
  );
}

const DURATIONS = [7, 30, 90, 365];

/** Creates a link, then shows it once with a QR code (BRQ-10.3). */
function ShareModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('passport');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const create = useCreateShare();
  const [days, setDays] = useState(30);
  const [created, setCreated] = useState<PassportShareCreated | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCreated(null);
      setQr(null);
    }
  }, [open]);

  useEffect(() => {
    if (!created) return;
    void QRCode.toDataURL(created.url, { margin: 1, width: 220, errorCorrectionLevel: 'M' }).then(
      setQr,
    );
  }, [created]);

  const onCreate = async () => {
    try {
      setCreated(await create.mutateAsync(days));
      toast.show({ tone: 'success', title: t('created') });
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };

  const onCopy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      toast.show({ tone: 'success', title: t('copied') });
    } catch {
      // Clipboard can be blocked; the link stays selectable in the field.
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('shareTitle')}
      footer={
        created ? (
          <Button onClick={onClose}>{t('close')}</Button>
        ) : (
          <Button loading={create.isPending} onClick={() => void onCreate()}>
            {t('create')}
          </Button>
        )
      }
    >
      <p className="text-sm text-slate-700">{t('shareIntro')}</p>
      {!created ? (
        <div className="mt-4 w-48">
          <Select
            label={t('expires')}
            value={String(days)}
            onChange={(e) => setDays(Number(e.target.value))}
            options={DURATIONS.map((d) => ({ value: String(d), label: t('days', { count: d }) }))}
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-3">
          {qr && (
            <img
              src={qr}
              width={220}
              height={220}
              alt={t('qrAlt')}
              className="rounded border border-slate-200"
            />
          )}
          <label htmlFor="share-url" className="self-start text-sm font-medium text-slate-800">
            {t('linkLabel')}
          </label>
          <div className="flex w-full gap-2">
            <input
              id="share-url"
              readOnly
              value={created.url}
              onFocus={(e) => e.target.select()}
              className="min-w-0 flex-1 rounded-md border border-slate-400 px-3 py-2 font-mono text-xs"
            />
            <Button variant="secondary" onClick={() => void onCopy()}>
              {t('copy')}
            </Button>
          </div>
          <p className="text-xs text-slate-600">{t('onceOnly')}</p>
        </div>
      )}
    </Modal>
  );
}
