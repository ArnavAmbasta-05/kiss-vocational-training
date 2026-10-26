import { z } from 'zod';
import type { AssessmentMode, CertificateStatus, Grade } from '../enums';

// ─── Skill Passport (F10: BRQ-10.1–10.4, BR-14) ────────────────────────────────

export interface PassportEntry {
  ratingId: string;
  competencyId: string;
  code: string;
  title: string;
  mode: AssessmentMode;
  level: number;
  requiredLevel: number;
  courseTitle: string;
  batchName: string;
  cycleName: string;
  verifiedAt: string;
  verifiedBy: string;
  /** BRQ-10.2: practical evidence linked to this competency (signed-in passport only). */
  evidence?: Array<{ id: string; kind: 'FILE' | 'LINK'; label: string }>;
}

export interface RevokedPassportEntry extends PassportEntry {
  revokedAt: string;
  revokedReason: string;
}

export interface PassportCertificate {
  id: string;
  publicCode: string;
  status: CertificateStatus;
  courseTitle: string;
  grade: Grade;
  issuedAt: string;
}

/** The signed-in view: the student, their trainers and admins (BRQ-10.1, 10.2, 10.4). */
export interface Passport {
  student: { id: string; fullName: string; rollNo: string; photoUrl: string | null };
  practical: PassportEntry[];
  theory: PassportEntry[];
  /** Kept on record but no longer counted (BR-14); never shown publicly. */
  revoked: RevokedPassportEntry[];
  certificates: PassportCertificate[];
}

export const RevokeSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
export type RevokeInput = z.infer<typeof RevokeSchema>;

// ─── Share links (BRQ-10.3) ────────────────────────────────────────────────────

export const ShareCreateSchema = z
  .object({ expiresInDays: z.coerce.number().int().min(1).max(3650).optional() })
  .strict();
export type ShareCreateInput = z.infer<typeof ShareCreateSchema>;

export interface PassportShareDto {
  id: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  active: boolean;
}

/** Returned once, when the link is created; only a hash of the token is stored. */
export interface PassportShareCreated extends PassportShareDto {
  token: string;
  url: string;
}

// ─── Public views (BR-15: never marks, attendance or contact details) ─────────

/** Whitelisted fields only. Tests pin these keys so nothing extra can leak. */
export interface PublicPassport {
  fullName: string;
  photoUrl: string | null;
  practical: Array<{ title: string; level: number; courseTitle: string; verifiedAt: string }>;
  theory: Array<{ title: string; level: number; courseTitle: string; verifiedAt: string }>;
  certificates: Array<{ courseTitle: string; grade: Grade; issuedAt: string; publicCode: string }>;
}

/** GET /public/verify/:code (BRQ-15.3): status, and the revocation date but never its reason. */
export interface PublicVerification {
  name: string;
  course: string;
  grade: Grade;
  issueDate: string;
  status: CertificateStatus;
  revokedOn: string | null;
}
