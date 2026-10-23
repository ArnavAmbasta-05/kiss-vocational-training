import type { ReactNode } from 'react';

/** A single headline figure: the number is the content, the label says what it counts. */
export function StatTile({
  label,
  value,
  detail,
  testId,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-testid={testId}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-600">{detail}</p>}
    </div>
  );
}
