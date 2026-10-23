import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReportFormat } from '@vtmp/shared';
import { Button } from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';

/** "Download CSV" / "Download PDF" for one report; each button shows its own progress. */
export function ReportButtons({
  name,
  download,
  size = 'md',
}: {
  /** What is being downloaded, for screen-reader labels. */
  name: string;
  download: (format: ReportFormat) => Promise<void>;
  size?: 'sm' | 'md';
}) {
  const { t } = useTranslation('reports');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [busy, setBusy] = useState<ReportFormat | null>(null);

  const run = async (format: ReportFormat) => {
    setBusy(format);
    try {
      await download(format);
    } catch (err) {
      toast.show({ tone: 'error', title: `${t('failed')}: ${errorMessage(err)}` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {(['csv', 'pdf'] as const).map((format) => (
        <Button
          key={format}
          size={size}
          variant="secondary"
          loading={busy === format}
          disabled={busy !== null}
          aria-label={t(`${format}For`, { name })}
          onClick={() => void run(format)}
        >
          {t(format)}
        </Button>
      ))}
    </div>
  );
}
