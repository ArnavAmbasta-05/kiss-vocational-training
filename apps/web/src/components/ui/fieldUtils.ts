export function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

export const controlClass =
  'h-10 w-full rounded-md border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ' +
  'disabled:bg-slate-100 disabled:text-slate-500';
