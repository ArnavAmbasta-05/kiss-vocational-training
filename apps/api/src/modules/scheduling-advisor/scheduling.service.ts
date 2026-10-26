import type {
  BatchScheduleAdvice,
  ScheduleClash,
  SchedulingCheckInput,
  SchedulingCheckResult,
} from '@vtmp/shared';
import { prisma } from '../../core/db';
import { AppError } from '../../core/errors';
import { settings } from '../../core/settings';
import * as batches from '../batches/batches.service';
import { capacityLevel, clashesFor, type BookedSlot } from '../batches/rules';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Suggested slots stay inside the working day, institution local time. */
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 19;
const MAX_SLOT_SUGGESTIONS = 3;
const MAX_TRAINER_SUGGESTIONS = 5;

interface Slot extends BookedSlot {
  id: string | null;
  proposed: boolean;
}

const iso = (d: Date) => d.toISOString();

/**
 * Nearby free slots of the same length for a clashing session: earlier and later the same day
 * (whole hours, working day only), then the same time on the next seven days. A slot is free
 * when it clashes with nothing, hard or soft (BRQ-14.3).
 */
function freeSlotsNear(
  slot: Slot,
  bookings: readonly BookedSlot[],
  utcOffsetMinutes: number,
): Array<{ startsAt: Date; endsAt: Date }> {
  const length = slot.endsAt.getTime() - slot.startsAt.getTime();
  const localHour = (d: Date) => new Date(d.getTime() + utcOffsetMinutes * 60_000).getUTCHours();
  const within = (start: Date) => {
    const end = new Date(start.getTime() + length);
    const endHour = localHour(new Date(end.getTime() - 1)) + 1;
    return localHour(start) >= DAY_START_HOUR && endHour <= DAY_END_HOUR;
  };
  const candidates: Date[] = [];
  for (let h = 1; h <= 10; h++) {
    candidates.push(new Date(slot.startsAt.getTime() - h * HOUR));
    candidates.push(new Date(slot.startsAt.getTime() + h * HOUR));
  }
  for (let d = 1; d <= 7; d++) candidates.push(new Date(slot.startsAt.getTime() + d * DAY));

  const out: Array<{ startsAt: Date; endsAt: Date }> = [];
  for (const startsAt of candidates) {
    if (out.length >= MAX_SLOT_SUGGESTIONS) break;
    if (startsAt.getTime() < Date.now() || !within(startsAt)) continue;
    const candidate = { ...slot, startsAt, endsAt: new Date(startsAt.getTime() + length) };
    if (clashesFor(candidate, bookings).length === 0) out.push(candidate);
  }
  return out;
}

/** Active trainers free for every given slot, those whose specialisation fits the course first. */
async function freeTrainers(
  slots: readonly Slot[],
  exclude: readonly string[],
  courseTitle: string,
): Promise<BatchScheduleAdvice['suggestions']['trainers']> {
  const all = (await batches.trainers()).filter((t) => !exclude.includes(t.id));
  if (all.length === 0) return [];
  let busy = new Set<string>();
  if (slots.length) {
    const window = {
      from: new Date(Math.min(...slots.map((s) => s.startsAt.getTime()))),
      to: new Date(Math.max(...slots.map((s) => s.endsAt.getTime()))),
    };
    const bookings = await batches.bookingsOverlapping(prisma(), window, {
      venues: [],
      trainerIds: all.map((t) => t.id),
    });
    busy = new Set(
      bookings.flatMap((b) =>
        slots.some((s) => s.startsAt < b.endsAt && b.startsAt < s.endsAt) ? b.trainerIds : [],
      ),
    );
  }
  const words = courseTitle
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3);
  const fits = (spec: string | null) =>
    !!spec && words.some((w) => spec.toLowerCase().includes(w)) ? 1 : 0;
  return all
    .filter((t) => !busy.has(t.id))
    .sort(
      (a, b) =>
        fits(b.specialization) - fits(a.specialization) || a.fullName.localeCompare(b.fullName),
    )
    .slice(0, MAX_TRAINER_SUGGESTIONS)
    .map((t) => ({ id: t.id, fullName: t.fullName, specialization: t.specialization }));
}

/**
 * POST /scheduling/check (F14): for each batch, capacity after adding students (BRQ-14.1),
 * venue and trainer clashes of its proposed and upcoming sessions (BRQ-14.2, BR-20), and
 * suggested free slots and trainers (BRQ-14.3). Read-only: nothing is saved.
 */
export async function check(input: SchedulingCheckInput): Promise<SchedulingCheckResult> {
  const ids = input.batches.map((b) => b.batchId);
  const [facts, warnAt, offset] = await Promise.all([
    batches.capacityOf(ids),
    settings.get('scheduling.capacityWarnPercent'),
    settings.get('institution.utcOffsetMinutes'),
  ]);
  const missing = ids.filter((id) => !facts.has(id));
  if (missing.length) throw AppError.notFound('Batch not found');

  const out: BatchScheduleAdvice[] = [];
  for (const item of input.batches) {
    const f = facts.get(item.batchId)!;
    const [trainers, upcoming] = await Promise.all([
      batches.assignedTrainers(item.batchId),
      batches.upcomingSessions(item.batchId),
    ]);
    const teamIds = trainers.map((t) => t.id);
    const names = new Map(trainers.map((t) => [t.id, t.fullName]));
    const asSlot = (s: {
      id: string | null;
      startsAt: Date;
      endsAt: Date;
      venue: string;
      trainerId: string | null;
      proposed: boolean;
    }): Slot => ({
      ...s,
      explicitTrainerId: s.trainerId,
      trainerIds: s.trainerId ? [s.trainerId] : teamIds,
    });
    const slots: Slot[] = [
      ...item.sessions.map((p) =>
        asSlot({
          id: null,
          startsAt: new Date(p.startsAt),
          endsAt: new Date(p.endsAt),
          venue: p.venue ?? f.venue,
          trainerId: p.trainerId ?? null,
          proposed: true,
        }),
      ),
      ...upcoming.map((u) => asSlot({ ...u, proposed: false })),
    ];

    const clashes: ScheduleClash[] = [];
    const slotSuggestions: BatchScheduleAdvice['suggestions']['slots'] = [];
    if (slots.length) {
      // One query covers the checked sessions and a week after them (for suggested slots).
      const window = {
        from: new Date(Math.min(...slots.map((s) => s.startsAt.getTime())) - 12 * HOUR),
        to: new Date(Math.max(...slots.map((s) => s.endsAt.getTime())) + 8 * DAY),
      };
      const bookings = await batches.bookingsOverlapping(prisma(), window, {
        venues: [...new Set(slots.map((s) => s.venue))],
        trainerIds: [...new Set(slots.flatMap((s) => s.trainerIds))],
      });
      for (const b of bookings)
        for (const [id, n] of b.trainerNames) if (!names.has(id)) names.set(id, n);

      for (const slot of slots) {
        const others = bookings.filter((b) => b.id !== slot.id);
        const found = clashesFor(slot, others);
        for (const c of found) {
          clashes.push({
            kind: c.kind,
            hard: c.hard,
            session: {
              startsAt: iso(slot.startsAt),
              endsAt: iso(slot.endsAt),
              venue: slot.venue,
              proposed: slot.proposed,
            },
            with: {
              sessionId: c.other.id,
              batchId: c.other.batchId,
              batchName: c.other.batchName,
              startsAt: iso(c.other.startsAt),
              endsAt: iso(c.other.endsAt),
              venue: c.other.venue,
            },
            ...(c.trainerId
              ? { trainer: { id: c.trainerId, fullName: names.get(c.trainerId) ?? '' } }
              : {}),
          });
        }
        if (slot.proposed && found.length) {
          for (const free of freeSlotsNear(slot, others, offset)) {
            slotSuggestions.push({
              forStartsAt: iso(slot.startsAt),
              startsAt: iso(free.startsAt),
              endsAt: iso(free.endsAt),
            });
          }
        }
      }
    }

    const needTrainer = trainers.length === 0 || clashes.some((c) => c.kind === 'TRAINER');
    const projected = f.enrolled + item.addStudents;
    out.push({
      batchId: item.batchId,
      batchName: f.name,
      capacity: {
        capacity: f.capacity,
        enrolled: f.enrolled,
        projected,
        ...capacityLevel(projected, f.capacity, warnAt),
        warnAt,
      },
      clashes,
      trainers,
      suggestions: {
        slots: slotSuggestions,
        trainers: needTrainer ? await freeTrainers(slots, teamIds, f.courseTitle) : [],
      },
    });
  }
  return { batches: out };
}
