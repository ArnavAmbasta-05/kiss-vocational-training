import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AuthSession, LoginInput, Me } from '@vtmp/shared';
import { api, setAccessTokenProvider, setUnauthorizedHandler } from '../api/client';
import { AuthContext, type AuthStatus } from './context';

// Module-level so the API client can read it synchronously; never persisted.
let accessToken: string | null = null;
setAccessTokenProvider(() => accessToken);

// Refresh a minute before the 15-minute access token expires.
const REFRESH_LEAD_SECONDS = 60;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<Me | null>(null);
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  // One refresh at a time: concurrent 401s share it, and rotation never races itself.
  const inFlight = useRef<Promise<boolean> | null>(null);

  // Whether a session was ever active in this page. Only then is there private data to drop:
  // clearing the cache on a first, anonymous load would also cancel public pages' requests.
  const hadSession = useRef(false);

  const clearSession = useCallback(() => {
    accessToken = null;
    clearTimeout(timer.current);
    setUser(null);
    setStatus('anonymous');
    if (hadSession.current) queryClient.clear();
    hadSession.current = false;
  }, [queryClient]);

  const applySession = useCallback(
    (session: AuthSession) => {
      accessToken = session.accessToken;
      hadSession.current = true;
      setUser(session.user);
      setStatus('authenticated');
      if (i18n.resolvedLanguage !== session.user.locale) {
        void i18n.changeLanguage(session.user.locale);
      }
      clearTimeout(timer.current);
      const delay = Math.max(session.expiresIn - REFRESH_LEAD_SECONDS, 30) * 1000;
      timer.current = setTimeout(() => void refreshRef.current(), delay);
    },
    [i18n],
  );

  const refresh = useCallback((): Promise<boolean> => {
    inFlight.current ??= api
      .post<AuthSession>('/auth/refresh')
      .then((session) => {
        applySession(session);
        return true;
      })
      .catch(() => {
        clearSession();
        return false;
      })
      .finally(() => {
        inFlight.current = null;
      });
    return inFlight.current;
  }, [applySession, clearSession]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    setUnauthorizedHandler(() => refreshRef.current());
    // Restore the session from the refresh cookie on first load.
    void refreshRef.current();
    return () => clearTimeout(timer.current);
  }, []);

  const login = useCallback(
    async (input: LoginInput) => {
      const session = await api.post<AuthSession>('/auth/login', input);
      applySession(session);
      return session.user;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({ status, user, login, logout, setUser }),
    [status, user, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
