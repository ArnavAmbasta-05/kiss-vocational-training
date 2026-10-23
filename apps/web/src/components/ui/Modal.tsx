import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Built on the native <dialog>: showModal() gives a focus trap, Escape to close,
 * inert background and focus return to the opener for free.
 */
export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { t } = useTranslation();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // On small screens the dialog never outgrows the viewport: the title and the buttons stay
      // in view and only the body scrolls (otherwise Save can sit below the fold on a phone).
      className="max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg p-0 shadow-xl backdrop:bg-slate-900/50 open:flex"
    >
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <span aria-hidden="true">✕</span>
          <span className="sr-only">{t('actions.close')}</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && (
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-3">
          {footer}
        </div>
      )}
    </dialog>
  );
}
