import type { AuthUser } from '@vtmp/shared';

declare global {
  namespace Express {
    interface Request {
      /** Set by authenticate(). studentId / trainerId are the profile ids for those roles. */
      user?: AuthUser & { studentId: string | null; trainerId: string | null };
    }
  }
}

export {};
