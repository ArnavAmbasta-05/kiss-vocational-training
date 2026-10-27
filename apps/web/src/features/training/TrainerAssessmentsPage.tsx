import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState, PageSkeleton, Select } from '../../components/ui';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { useMyBatches } from '../batches/api';
import { AssessmentsPanel } from './AssessmentsPanel';

/** Trainer: assessments of one of my batches, chosen from a selector (kept in the URL). */
export function TrainerAssessmentsPage() {
  const { t } = useTranslation('training');
  const errorMessage = useErrorMessage();
  const batches = useMyBatches();
  const [params, setParams] = useSearchParams();

  if (batches.isPending) return <PageSkeleton />;
  if (batches.isError) return <EmptyState title={errorMessage(batches.error)} />;
  const list = batches.data;
  const selected =
    list.find((b) => b.id === params.get('batch')) ??
    list.find((b) => b.status === 'ACTIVE') ??
    list[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('assessments.title')}</h1>
        <p className="mt-1 text-sm text-slate-700">{t('assessments.intro')}</p>
      </div>
      {!selected ? (
        <EmptyState title={t('assessments.noBatches')} />
      ) : (
        <>
          <div className="w-80 max-w-full">
            <Select
              label={t('assessments.batch')}
              value={selected.id}
              onChange={(e) => setParams({ batch: e.target.value }, { replace: true })}
              options={list.map((b) => ({ value: b.id, label: `${b.courseTitle} · ${b.name}` }))}
            />
          </div>
          <AssessmentsPanel
            key={selected.id}
            batchId={selected.id}
            editable={selected.status !== 'CLOSED'}
            marksBase="/trainer/assessments"
          />
        </>
      )}
    </div>
  );
}
