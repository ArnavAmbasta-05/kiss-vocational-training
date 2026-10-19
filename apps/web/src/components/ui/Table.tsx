import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from './cn';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export interface TableProps<T> {
  /** Describes the table for screen readers; set captionHidden to keep it visual-only hidden. */
  caption: string;
  captionHidden?: boolean;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
}

const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' };

export function Table<T>({
  caption,
  captionHidden = true,
  columns,
  rows,
  rowKey,
  empty,
}: TableProps<T>) {
  const { t } = useTranslation();
  if (rows.length === 0) return <>{empty ?? <EmptyState title={t('table.empty')} />}</>;

  return (
    // Wide tables scroll horizontally on small screens instead of breaking the layout.
    <div
      role="region"
      aria-label={caption}
      className="overflow-x-auto rounded-lg border border-slate-200"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable regions must be keyboard-reachable
      tabIndex={0}
    >
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <caption className={cn(captionHidden && 'sr-only')}>{caption}</caption>
        <thead className="bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'px-3 py-2 font-semibold text-slate-700',
                  alignClass[c.align ?? 'left'],
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-slate-50">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-3 py-2 text-slate-800',
                    alignClass[c.align ?? 'left'],
                    c.className,
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
