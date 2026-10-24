import { createHash, randomBytes } from 'node:crypto';
import type {
  Passport,
  PassportShareCreated,
  PassportShareDto,
  PublicPassport,
} from '@vtmp/shared';
import { withAudit, type Actor } from '../../core/audit';
import { config } from '../../core/config';
import { prisma } from '../../core/db';
import { AppError } from '../../core/errors';
import { settings } from '../../core/settings';
import * as competency from '../competency/competency.service';
import * as documents from '../documents/documents.service';
import * as users from '../users/users.service';

/**
 * F10 Skill Passport (BRD §9.2). An innovation module: verified competencies come from the
 * competency service, identity from users, certificates from documents. It owns share links.
 */

/** BRQ-10.1, 10.2, 10.4: every verified competency across cycles, practical apart from theory. */
export async function passport(studentId: string): Promise<Passport> {
  const [student, entries, certificates] = await Promise.all([
    users.studentProfile(studentId),
    competency.verifiedEntries(studentId),
    documents.forStudent(studentId),
  ]);
  if (!student) throw AppError.notFound('Student not found');
  return {
    student,
    practical: entries.active.filter((e) => e.mode === 'PRACTICAL'),
    theory: entries.active.filter((e) => e.mode === 'THEORY'),
    revoked: entries.revoked,
    certificates: certificates.map((c) => ({
      id: c.id,
      publicCode: c.publicCode,
      status: c.status,
      courseTitle: c.courseTitle,
      grade: c.grade,
      issuedAt: c.issuedAt,
    })),
  };
}

export async function passportPdf(studentId: string): Promise<{ pdf: Buffer; filename: string }> {
  const [p, institution] = await Promise.all([
    passport(studentId),
    settings.get('institution.name'),
  ]);
  const slug = p.student.rollNo.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    pdf: await documents.renderPassport(p, institution),
    filename: `skill-passport-${slug}.pdf`,
  };
}

// ─── Share links (BRQ-10.3, TAD §9: 32-byte random, stored hashed) ────────────

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

type ShareRow = {
  id: string;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  viewCount: number;
  lastViewedAt: Date | null;
};

function toShare(s: ShareRow, now = new Date()): PassportShareDto {
  return {
    id: s.id,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt?.toISOString() ?? null,
    revokedAt: s.revokedAt?.toISOString() ?? null,
    viewCount: s.viewCount,
    lastViewedAt: s.lastViewedAt?.toISOString() ?? null,
    active: !s.revokedAt && (!s.expiresAt || s.expiresAt > now),
  };
}

export async function listShares(studentId: string): Promise<PassportShareDto[]> {
  const rows = await prisma().passportShare.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => toShare(r));
}

/** The token is returned once; only its SHA-256 is stored, so a database leak reveals no link. */
export async function createShare(
  actor: Actor,
  studentId: string,
  expiresInDays?: number,
): Promise<PassportShareCreated> {
  const [fallback, max] = await Promise.all([
    settings.get('passport.shareDefaultDays'),
    settings.get('passport.shareMaxDays'),
  ]);
  const days = expiresInDays ?? fallback;
  if (days > max) {
    throw AppError.unprocessable('SHARE_TOO_LONG', `A link can last at most ${max} days`);
  }
  const token = randomBytes(32).toString('base64url');
  const row = await withAudit(actor, async (tx, log) => {
    const s = await tx.passportShare.create({
      data: {
        studentId,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + days * 86_400_000),
      },
    });
    await log({
      action: 'PASSPORT_SHARE_CREATED',
      entity: 'PassportShare',
      entityId: s.id,
      newValue: { studentId, expiresAt: s.expiresAt },
    });
    return s;
  });
  return {
    ...toShare(row),
    token,
    url: `${config().PUBLIC_BASE_URL.replace(/\/$/, '')}/p/${token}`,
  };
}

/** The student revokes their own link; it then answers 410 (BRD acceptance). */
export async function revokeShare(actor: Actor, studentId: string, shareId: string) {
  const s = await prisma().passportShare.findUnique({ where: { id: shareId } });
  if (!s) throw AppError.notFound('Share link not found');
  if (s.studentId !== studentId) throw AppError.forbidden();
  if (!s.revokedAt) {
    await withAudit(actor, async (tx, log) => {
      await tx.passportShare.update({ where: { id: shareId }, data: { revokedAt: new Date() } });
      await log({
        action: 'PASSPORT_SHARE_REVOKED',
        entity: 'PassportShare',
        entityId: shareId,
        oldValue: { revokedAt: null },
        newValue: { revoked: true },
      });
    });
  }
  return toShare((await prisma().passportShare.findUniqueOrThrow({ where: { id: shareId } }))!);
}

/**
 * GET /public/passport/:token — whitelisted fields only (BR-15): name, optional photo,
 * verified competencies (title, level, course, date) and valid certificates. Unknown token →
 * 404; revoked or expired → 410 "Link no longer active".
 */
export async function publicPassport(token: string): Promise<PublicPassport> {
  const share = await prisma().passportShare.findUnique({ where: { tokenHash: hash(token) } });
  if (!share) throw new AppError(404, 'LINK_NOT_FOUND', 'Link not found');
  if (share.revokedAt || (share.expiresAt && share.expiresAt <= new Date())) {
    throw new AppError(410, 'LINK_INACTIVE', 'Link no longer active');
  }
  // Counting a view must never slow down or break the page.
  void prisma()
    .passportShare.update({
      where: { id: share.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    })
    .catch(() => undefined);

  const p = await passport(share.studentId);
  const pick = (e: Passport['practical'][number]) => ({
    title: e.title,
    level: e.level,
    courseTitle: e.courseTitle,
    verifiedAt: e.verifiedAt.slice(0, 10),
  });
  return {
    fullName: p.student.fullName,
    photoUrl: p.student.photoUrl,
    practical: p.practical.map(pick),
    theory: p.theory.map(pick),
    certificates: p.certificates
      .filter((c) => c.status === 'VALID')
      .map((c) => ({
        courseTitle: c.courseTitle,
        grade: c.grade,
        issuedAt: c.issuedAt.slice(0, 10),
        publicCode: c.publicCode,
      })),
  };
}
