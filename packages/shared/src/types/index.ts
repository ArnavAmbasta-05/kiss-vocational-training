import type { Role, Locale } from '../enums';

/** Identity carried on an authenticated request (filled in by Sprint 2 auth). */
export interface AuthUser {
  id: string;
  role: Role;
  locale: Locale;
}

export type Uuid = string;
export type IsoDateString = string;
