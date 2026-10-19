import { createContext, useContext } from 'react';
import type { LoginInput, Me, Role } from '@vtmp/shared';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: Me | null;
  login: (input: LoginInput) => Promise<Me>;
  logout: () => Promise<void>;
  /** Replace the cached user after a profile update. */
  setUser: (user: Me) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export const ROLE_HOME: Record<Role, string> = {
  STUDENT: '/student',
  TRAINER: '/trainer',
  ADMIN: '/admin',
};
