import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * WAI-ARIA tabs: arrow keys move between tabs, Home/End jump, only the selected tab is in the
 * tab order, and each panel is labelled by its tab.
 */
export function Tabs({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string;
  items: TabItem[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const base = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(
    0,
    items.findIndex((t) => t.id === selected),
  );

  const onKey = (e: KeyboardEvent) => {
    const last = items.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    onSelect(items[next]!.id);
    refs.current[next]?.focus();
  };

  return (
    <div>
      {/* Tabs that don't fit (phones) scroll sideways instead of spilling off screen. */}
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-1 overflow-x-auto border-b border-slate-200"
      >
        {items.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${base}-tab-${t.id}`}
            aria-selected={i === index}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={i === index ? 0 : -1}
            onClick={() => onSelect(t.id)}
            onKeyDown={onKey}
            className={cn(
              '-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
              i === index
                ? 'border-brand-700 text-brand-800'
                : 'border-transparent text-slate-600 hover:text-slate-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {items.map((t, i) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-panel-${t.id}`}
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={i !== index}
          className="pt-4"
        >
          {i === index && t.content}
        </div>
      ))}
    </div>
  );
}
