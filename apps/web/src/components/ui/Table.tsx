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
    // Desktop and tablet: a normal table that scrolls sideways if it is too wide. Phones (below
    // the sm breakpoint): each row becomes a card with "Header: value" lines, so nothing needs
    // sideways scrolling. The explicit roles keep table semantics for screen readers even though
    // the phone layout changes the elements' display.
    <div
      role="region"
      aria-label={caption}
      // relative: absolutely positioned children (sr-only header labels) stay inside the scroll
      // area instead of widening the whole page on phones.
      className="relative overflow-x-auto rounded-lg border border-slate-200 max-sm:overflow-visible max-sm:border-0"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable regions must be keyboard-reachable
      tabIndex={0}
    >
      <table
        role="table"
        className="min-w-full divide-y divide-slate-200 text-sm max-sm:block max-sm:divide-y-0"
      >
        <caption className={cn(captionHidden && 'sr-only')}>{caption}</caption>
        {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- explicit roles keep table semantics when the phone layout changes display */}
        <thead role="rowgroup" className="bg-slate-50 max-sm:block max-sm:bg-transparent">
          <tr role="row" className="max-sm:flex max-sm:items-center max-sm:gap-2">
            {columns.map((c) => (
              <th
                key={c.key}
                role="columnheader"
                scope="col"
                className={cn(
                  'px-3 py-2 font-semibold text-slate-700',
                  alignClass[c.align ?? 'left'],
                  // On phones each card repeats the text headers, so only controls (such as a
                  // select-all checkbox) stay visible above the cards.
                  typeof c.header === 'string' ? 'max-sm:sr-only' : 'max-sm:px-1',
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- explicit roles keep table semantics when the phone layout changes display */}
        <tbody
          role="rowgroup"
          className="divide-y divide-slate-100 bg-white max-sm:flex max-sm:flex-col max-sm:gap-3 max-sm:divide-y-0 max-sm:bg-transparent"
        >
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              role="row"
              className="hover:bg-slate-50 max-sm:block max-sm:rounded-lg max-sm:border max-sm:border-slate-200 max-sm:bg-white max-sm:p-3"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  // eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role -- explicit roles keep table semantics when the phone layout changes display
                  role="cell"
                  className={cn(
                    'px-3 py-2 text-slate-800',
                    alignClass[c.align ?? 'left'],
                    c.className,
                    'max-sm:flex max-sm:items-start max-sm:justify-between max-sm:gap-3 max-sm:px-0 max-sm:py-1 max-sm:text-left',
                  )}
                >
                  {typeof c.header === 'string' && (
                    <span
                      aria-hidden="true"
                      className="shrink-0 font-medium text-slate-600 sm:hidden"
                    >
                      {c.header}
                    </span>
                  )}
                  <div className="min-w-0 max-sm:text-right sm:contents">{c.render(row)}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
