import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PASSWORD_MIN_LENGTH,
  STUDENT_IMPORT_MAX_ROWS,
  type StudentImportResult,
} from '@vtmp/shared';
import { Button, Input, Modal, Table } from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { useImportStudents } from './api';

/** Rows with problems shown in the dialog; the rest are summarised. */
const SHOWN = 50;

/**
 * A5 (BRQ-1.5): create many students from a CSV. The file is checked first (nothing is created) and every
 * problem is listed by line; only a file with no problems can be imported, all at once. Each
 * student signs in with the shared first password and must then choose their own.
 */
export function ImportStudentsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation(['users', 'common']);
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const run = useImportStudents();
  const fileId = useId();
  const [csv, setCsv] = useState('');
  const [password, setPassword] = useState('');
  const [weak, setWeak] = useState(false);
  const [preview, setPreview] = useState<StudentImportResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setCsv('');
    setPassword('');
    setWeak(false);
    setPreview(null);
  }, [open]);

  const strong =
    password.length >= PASSWORD_MIN_LENGTH && /\p{L}/u.test(password) && /\d/.test(password);

  const send = async (dryRun: boolean) => {
    if (!strong) return setWeak(true);
    try {
      const r = await run.mutateAsync({ csv, password, dryRun });
      if (dryRun || r.created === 0) setPreview(r);
      else {
        toast.show({ tone: 'success', title: t('import.done', { count: r.created }) });
        onClose();
      }
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };

  const problems = (preview?.rows ?? []).filter((r) => r.errors.length > 0);
  const ready = !!preview && preview.invalid === 0 && preview.valid > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('import.title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          {ready ? (
            <Button loading={run.isPending} onClick={() => void send(false)}>
              {t('import.confirm', { count: preview.valid })}
            </Button>
          ) : (
            <Button loading={run.isPending} disabled={!csv} onClick={() => void send(true)}>
              {t('import.check')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm text-slate-700">
        <p>{t('import.body', { max: STUDENT_IMPORT_MAX_ROWS })}</p>
        <div>
          <label htmlFor={fileId} className="font-medium text-slate-800">
            {t('import.file')}
          </label>
          <input
            id={fileId}
            type="file"
            accept=".csv,text/csv"
            className="mt-1 block w-full text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setPreview(null);
              if (file) void file.text().then(setCsv);
              else setCsv('');
            }}
          />
        </div>
        <Input
          label={t('import.password')}
          type="text"
          autoComplete="new-password"
          value={password}
          hint={t('import.passwordHint')}
          error={
            weak && !strong ? t('resetPassword.tooShort', { min: PASSWORD_MIN_LENGTH }) : undefined
          }
          onChange={(e) => {
            setPassword(e.target.value);
            setWeak(false);
          }}
        />
        {preview && (
          <div role="status" className="flex flex-col gap-2">
            <p className={preview.invalid ? 'text-amber-900' : 'text-green-800'}>
              {preview.invalid
                ? t('import.problems', { valid: preview.valid, invalid: preview.invalid })
                : t('import.ready', { count: preview.valid })}
            </p>
            {problems.length > 0 && (
              <Table
                caption={t('import.caption')}
                columns={[
                  { key: 'line', header: t('import.line'), render: (r) => r.line },
                  { key: 'who', header: t('import.who'), render: (r) => r.email || r.fullName },
                  {
                    key: 'errors',
                    header: t('import.what'),
                    render: (r) =>
                      r.errors
                        .map((e) =>
                          t(`import.error.${e.code}`, { field: t(`import.field.${e.field}`) }),
                        )
                        .join('; '),
                  },
                ]}
                rows={problems.slice(0, SHOWN)}
                rowKey={(r) => String(r.line)}
              />
            )}
            {problems.length > SHOWN && (
              <p className="text-xs">{t('import.more', { count: problems.length - SHOWN })}</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
