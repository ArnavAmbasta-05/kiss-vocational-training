import type {
  AutomationRun,
  AutomationSettings,
  AutomationStatus,
  AutomationStep,
  AutomationStepResult,
} from '@vtmp/shared';
import type { Actor } from '../../core/audit';
import { prisma } from '../../core/db';
import { lastRun, withJobLease } from '../../core/jobs';
import { logger } from '../../core/logger';
import { settings, type SettingKey } from '../../core/settings';
import * as analytics from '../analytics/analytics.service';
import * as attendance from '../attendance/attendance.service';
import * as batches from '../batches/batches.service';
import * as courses from '../courses/courses.service';
import * as enrollments from '../enrollments/enrollments.service';
import { notify, type NewNotification } from '../notifications/notifications.service';
import * as passport from '../passport/passport.service';
import * as users from '../users/users.service';
import { analyticsStale, noticeWindowStart, readyToClose } from './rules';

export const DAILY_JOB = 'daily-automation';
const LEASE_MS = 10 * 60_000;
const DAY_MS = 86_400_000;
/** Scheduled runs act as the system, like the nightly risk check. */
const SYSTEM: Actor = { userId: null };

// ─── Settings (the Automation page) ───────────────────────────────────────────

const KEYS = {
  autoCloseBatches: 'automation.autoCloseBatches',
  autoCloseAfterDays: 'automation.autoCloseAfterDays',
  autoPromoteWaitlist: 'automation.autoPromoteWaitlist',
  latePlacementDays: 'automation.latePlacementDays',
  reminders: 'automation.reminders',
  pendingReminderDays: 'automation.pendingReminderDays',
  notices: 'automation.notices',
  passportExpiryNoticeDays: 'automation.passportExpiryNoticeDays',
  opportunityMatchPercent: 'automation.opportunityMatchPercent',
  placementFollowUpDays: 'automation.placementFollowUpDays',
  analyticsAutoRefreshMinutes: 'analytics.autoRefreshMinutes',
} as const satisfies Record<keyof AutomationSettings, SettingKey>;

const FIELDS = Object.keys(KEYS) as Array<keyof AutomationSettings>;

export async function automationSettings(): Promise<AutomationSettings> {
  const values = await settings.getMany(Object.values(KEYS));
  return Object.fromEntries(FIELDS.map((f) => [f, values[KEYS[f]]])) as AutomationSettings;
}

/** Each changed setting is stored with its own audit row (settings.set). */
export async function setAutomationSettings(
  actor: Actor,
  input: AutomationSettings,
): Promise<AutomationSettings> {
  const before = await automationSettings();
  for (const f of FIELDS) {
    if (before[f] !== input[f]) await settings.set(actor, KEYS[f], input[f]);
  }
  // Switching promotion on fills seats that are already free.
  if (!before.autoPromoteWaitlist && input.autoPromoteWaitlist) {
    await batches.promoteAllWaitlists(actor);
  }
  return automationSettings();
}

export async function status(): Promise<AutomationStatus> {
  const [s, run] = await Promise.all([automationSettings(), lastRun(DAILY_JOB)]);
  const outcome = run?.lastResult as { ok?: boolean; result?: AutomationRun } | null | undefined;
  return {
    settings: s,
    lastRun: outcome?.result ?? null,
    lastSuccessAt: run?.lastSuccessAt?.toISOString() ?? null,
  };
}

// ─── The daily run ────────────────────────────────────────────────────────────

async function institutionToday(now: Date): Promise<string> {
  const offset = await settings.get('institution.utcOffsetMinutes');
  return new Date(now.getTime() + offset * 60_000).toISOString().slice(0, 10);
}

async function toAdmins(n: Omit<NewNotification, 'userId'>): Promise<number> {
  const admins = await users.activeAdmins();
  await notify(
    prisma(),
    admins.map((a) => ({ ...n, userId: a.id })),
  );
  return admins.length;
}

/** A1 (BRQ-4.7): closes batches that are ready (BR-25) and tells their trainers and the admins. */
async function autoClose(now: Date, s: AutomationSettings): Promise<number> {
  const today = await institutionToday(now);
  const ready = readyToClose(await batches.endedActive(today), today, s.autoCloseAfterDays);
  let closed = 0;
  for (const b of ready) {
    try {
      await batches.close(SYSTEM, b.batchId);
    } catch (err) {
      // A decision changed since the list was read: leave it for the admin or tomorrow.
      logger.warn({ err, batchId: b.batchId }, 'automatic close skipped');
      continue;
    }
    closed++;
    const n = {
      type: 'BATCH_CLOSED' as const,
      title: 'Batch closed',
      body: `${b.courseTitle}, ${b.batchName} was closed automatically: training is over`,
      data: { courseTitle: b.courseTitle, batchName: b.batchName },
      link: `/admin/batches/${b.batchId}`,
    };
    const trainers = await batches.trainerUsers(b.batchId);
    await notify(
      prisma(),
      trainers.map((t) => ({ ...n, userId: t.id, link: `/trainer/batches/${b.batchId}` })),
    );
    await toAdmins(n);
  }
  return closed;
}

/** A3 (BRQ-9.5): one reminder per person per day, only when there is something to do. */
async function reminders(now: Date, s: AutomationSettings): Promise<number> {
  let sent = 0;
  const unmarked = await attendance.unmarkedByTrainer(now);
  await notify(
    prisma(),
    [...unmarked].map(([userId, count]) => ({
      userId,
      type: 'REMINDER_ATTENDANCE' as const,
      title: 'Attendance to mark',
      body: `${count} session(s) ended without attendance; mark them before the edit window closes`,
      data: { count: String(count) },
      link: '/trainer/sessions',
    })),
  );
  sent += unmarked.size;

  const pending = await enrollments.pendingSubmittedBefore(
    new Date(now.getTime() - s.pendingReminderDays * DAY_MS),
  );
  if (pending > 0) {
    sent += await toAdmins({
      type: 'REMINDER_PENDING_APPLICATIONS',
      title: 'Applications waiting',
      body: `${pending} application(s) have waited more than ${s.pendingReminderDays} days`,
      data: { count: String(pending), days: String(s.pendingReminderDays) },
      link: '/admin/enrollments',
    });
  }

  const undecided = (await batches.endedActive(await institutionToday(now))).filter(
    (b) => b.undecided > 0,
  );
  if (undecided.length > 0) {
    sent += await toAdmins({
      type: 'REMINDER_ENDED_BATCHES',
      title: 'Completion decisions due',
      body: `${undecided.length} ended batch(es) still have students without a decision`,
      data: { count: String(undecided.length) },
      link: '/admin',
    });
  }
  return sent;
}

/** A4 (BRQ-9.6): applications opening and passport links nearing expiry, each told once. */
async function notices(from: Date, now: Date, s: AutomationSettings): Promise<number> {
  let sent = 0;
  for (const w of await courses.windowsOpenedBetween(from, now)) {
    const userIds = await enrollments.studentUsersWithoutApplication(w.cycleId);
    const courseList = w.courses.join(', ');
    await notify(
      prisma(),
      userIds.map((userId) => ({
        userId,
        type: 'APPLICATIONS_OPEN' as const,
        title: 'Applications are open',
        body: `${w.cycleName}: ${courseList}`,
        data: { cycleName: w.cycleName, courses: courseList },
        link: `/student/courses?cycle=${w.cycleId}`,
      })),
    );
    sent += userIds.length;
  }
  const expiring = await passport.sharesToWarn(from, now, s.passportExpiryNoticeDays);
  await notify(
    prisma(),
    expiring.map((e) => ({
      userId: e.userId,
      type: 'PASSPORT_LINK_EXPIRING' as const,
      title: 'A passport link expires soon',
      body: `A link to your Skill Passport stops working on ${e.expiresAt.toISOString().slice(0, 10)}`,
      data: { date: e.expiresAt.toISOString().slice(0, 10) },
      link: '/student/passport',
    })),
  );
  return sent + expiring.length;
}

/** A9 (BRQ-20.5): asks the admins once, per placement, whether the student is still in the job. */
async function placementFollowUp(from: Date, now: Date, s: AutomationSettings): Promise<number> {
  const due = await analytics.placementsDueFollowUp(from, now, s.placementFollowUpDays);
  let sent = 0;
  for (const p of due) {
    sent += await toAdmins({
      type: 'PLACEMENT_FOLLOW_UP',
      title: 'Placement follow-up',
      body: `Is ${p.studentName} still working as ${p.roleTitle} at ${p.employer}?`,
      data: {
        studentName: p.studentName,
        roleTitle: p.roleTitle,
        employer: p.employer,
        days: String(s.placementFollowUpDays),
      },
      link: '/admin/analytics',
    });
  }
  return sent;
}

async function step(
  name: AutomationStep,
  enabled: boolean,
  fn: () => Promise<number>,
): Promise<AutomationStepResult> {
  if (!enabled) return { step: name, enabled, count: 0 };
  try {
    return { step: name, enabled, count: await fn() };
  } catch (err) {
    logger.error({ err, step: name }, 'automation step failed');
    return {
      step: name,
      enabled,
      count: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * The daily automation run (Vercel Cron in production, node-cron locally, or Run now). One
 * lease, so two runs never overlap; each step is independent, so one failing step doesn't stop
 * the others. Notices that fire once cover the time since the last successful run.
 */
export async function runDaily(
  now = new Date(),
): Promise<{ ran: true; result: AutomationRun } | { ran: false }> {
  const run = await withJobLease(
    DAILY_JOB,
    LEASE_MS,
    async (previous) => {
      const s = await automationSettings();
      const autoApprove = await settings.get('enrollment.autoApprove');
      const from = noticeWindowStart(previous.lastSuccessAt, now);
      const steps = [
        await step('autoApproval', autoApprove, () =>
          enrollments.runAutoApprovalEverywhere(SYSTEM),
        ),
        await step('waitlist', s.autoPromoteWaitlist, () => batches.promoteAllWaitlists(SYSTEM)),
        await step('autoClose', s.autoCloseBatches, () => autoClose(now, s)),
        await step('reminders', s.reminders, () => reminders(now, s)),
        await step('notices', s.notices, () => notices(from, now, s)),
        await step('placementFollowUp', s.reminders, () => placementFollowUp(from, now, s)),
      ];
      return { ranAt: now.toISOString(), steps } satisfies AutomationRun;
    },
    { everyMs: DAY_MS },
  );
  return run.ran ? { ran: true, result: run.result } : { ran: false };
}

// ─── A8: analytics after certificates ─────────────────────────────────────────

/**
 * A8 (BRQ-20.4): refreshes outcome analytics after a certificate is issued, unless they were refreshed in the
 * last analytics.autoRefreshMinutes (a bulk approval then refreshes once, not per student).
 */
export async function refreshAnalyticsAfterCertificate(): Promise<boolean> {
  const [minutes, run] = await Promise.all([
    settings.get('analytics.autoRefreshMinutes'),
    lastRun(analytics.REFRESH_JOB),
  ]);
  if (!analyticsStale(run?.lastSuccessAt ?? null, new Date(), minutes)) return false;
  return (await analytics.refresh()).refreshed;
}
