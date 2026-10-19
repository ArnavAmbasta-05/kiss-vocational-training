import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AppNotification } from '@vtmp/shared';
import { cn } from '../../components/ui';
import { relativeTime } from '../../lib/format';
import { useMarkAllRead, useMarkRead, useNotifications } from './api';

/** Top-bar bell with unread count and a dropdown list (in-app notifications, Sprint 3). */
export function NotificationBell() {
  const { t, i18n } = useTranslation('notifications');
  const lng = i18n.resolvedLanguage ?? 'en';
  const { data } = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const unread = data?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const text = (n: AppNotification) => ({
    title: t(`types.${n.type}.title`, { ...n.data, defaultValue: n.title }),
    body: t(`types.${n.type}.body`, { ...n.data, defaultValue: n.body }),
  });

  const openItem = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
    if (n.link) {
      // The linked page may show what changed (e.g. a status); refresh it.
      void qc.invalidateQueries();
      navigate(n.link);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        data-testid="notification-bell"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <span className="sr-only">
          {unread > 0 ? t('bellUnread', { count: unread }) : t('bell')}
        </span>
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-xs font-bold text-slate-900"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-slate-200 bg-white text-slate-800 shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <h2 className="text-sm font-semibold">{t('heading')}</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                className="text-xs font-medium text-brand-700 underline hover:text-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                {t('markAllRead')}
              </button>
            )}
          </div>
          {!data || data.data.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-600">{t('empty')}</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {data.data.map((n) => {
                const { title, body } = text(n);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn(
                        'block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none',
                        !n.readAt && 'bg-brand-50',
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        {!n.readAt && (
                          <>
                            <span
                              aria-hidden="true"
                              className="h-2 w-2 rounded-full bg-brand-600"
                            />
                            <span className="sr-only">{t('unread')}:</span>
                          </>
                        )}
                        {title}
                      </span>
                      <span className="mt-0.5 block text-sm text-slate-700">{body}</span>
                      <span className="mt-0.5 block text-xs text-slate-600">
                        {relativeTime(n.createdAt, lng)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
