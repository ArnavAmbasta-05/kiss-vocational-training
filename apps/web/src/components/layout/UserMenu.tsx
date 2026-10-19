import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';

/** Account disclosure menu: name and role, profile link, sign out. */
export function UserMenu() {
  const { t } = useTranslation(['common', 'auth']);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const ref = useRef<HTMLDivElement>(null);

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

  if (!user) return null;

  const signOut = async () => {
    setOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  const initials = user.fullName
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-semibold text-brand-800"
        >
          {initials}
        </span>
        <span className="hidden text-left text-sm leading-tight sm:block">
          <span className="block font-medium">{user.fullName}</span>
          <span className="block text-xs text-brand-100">{t(`roles.${user.role}`)}</span>
        </span>
        <span className="sr-only sm:hidden">{t('nav.userMenu')}</span>
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 mt-2 w-56 rounded-md border border-slate-200 bg-white py-1 text-slate-800 shadow-lg"
        >
          <p className="border-b border-slate-100 px-3 py-2 text-xs text-slate-600">{user.email}</p>
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
          >
            {t('nav.profile')}
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
          >
            {t('auth:signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
