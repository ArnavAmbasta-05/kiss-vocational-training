import type { Prisma } from '@prisma/client';
import type { AppNotification, NotificationType } from '@vtmp/shared';
import type { Tx } from '../../core/db';
import { prisma } from '../../core/db';
import { AppError } from '../../core/errors';

export interface NewNotification {
  userId: string;
  type: NotificationType;
  /** English fallback text; the web app renders `type` + `data` through t(). */
  title: string;
  body: string;
  data?: Record<string, string>;
  link?: string;
}

/**
 * Creates in-app notifications inside the caller's transaction, so a notification exists
 * exactly when the change it describes was committed.
 */
export async function notify(tx: Tx, items: NewNotification[]): Promise<void> {
  if (items.length === 0) return;
  await tx.notification.createMany({
    data: items.map((n) => ({
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data as Prisma.InputJsonValue | undefined,
      link: n.link ?? null,
    })),
  });
}

function toDto(n: Prisma.NotificationGetPayload<object>): AppNotification {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    data: (n.data as Record<string, string> | null) ?? null,
    link: n.link,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

export async function listMine(
  userId: string,
  opts: { unreadOnly?: boolean; limit: number },
): Promise<{ data: AppNotification[]; unreadCount: number }> {
  const [rows, unreadCount] = await Promise.all([
    prisma().notification.findMany({
      where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: opts.limit,
    }),
    prisma().notification.count({ where: { userId, readAt: null } }),
  ]);
  return { data: rows.map(toDto), unreadCount };
}

export async function markRead(userId: string, id: string): Promise<void> {
  // Scoped by userId: someone else's notification behaves as if it did not exist.
  const result = await prisma().notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    const exists = await prisma().notification.count({ where: { id, userId } });
    if (!exists) throw AppError.notFound('Notification not found');
  }
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await prisma().notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}
