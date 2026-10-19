import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../ui/cn';
import { ToastContext, type Toast, type ToastInput, type ToastTone } from './context';

const AUTO_DISMISS_MS = 5000;

const toneClass: Record<ToastTone, string> = {
  info: 'border-brand-300 bg-white',
  success: 'border-green-400 bg-green-50',
  error: 'border-red-400 bg-red-50',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    ({ tone = 'info', ...input }: ToastInput) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, tone, ...input }]);
      // Errors stay until dismissed so they are not missed.
      if (tone !== 'error') setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <section
        aria-label={t('toast.regionLabel')}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {/* role=status/alert announce new toasts without moving focus. */}
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-3 shadow-lg',
              toneClass[toast.tone],
            )}
          >
            <div className="flex-1 text-sm">
              <p className="font-semibold text-slate-900">{toast.title}</p>
              {toast.body && <p className="mt-0.5 text-slate-700">{toast.body}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="rounded p-1 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              <span aria-hidden="true">✕</span>
              <span className="sr-only">{t('actions.dismiss')}</span>
            </button>
          </div>
        ))}
      </section>
    </ToastContext.Provider>
  );
}
