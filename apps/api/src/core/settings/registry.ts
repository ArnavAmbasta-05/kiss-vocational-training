import { z } from 'zod';
import { AllocationPriorityRuleSchema } from '@vtmp/shared';

const percent = z.number().min(0).max(100);
const positiveInt = z.number().int().positive();

const GradeBandsSchema = z
  .object({ A: percent, B: percent, C: percent, D: percent })
  .refine((b) => b.A > b.B && b.B > b.C && b.C > b.D, {
    message: 'Grade bands must be strictly descending (A > B > C > D)',
  });

interface SettingDefinition<S extends z.ZodTypeAny> {
  schema: S;
  default: z.infer<S>;
  description: string;
}

function define<S extends z.ZodTypeAny>(
  schema: S,
  defaultValue: z.infer<S>,
  description: string,
): SettingDefinition<S> {
  return { schema, default: schema.parse(defaultValue), description };
}

/**
 * Every configurable threshold in the system (CLAUDE.md rule 4). Services read these through
 * settings.get(key); nothing hard-codes a number that appears here. BRD references in brackets.
 */
export const SETTINGS = {
  'attendance.minPercent': define(percent, 75, 'Minimum attendance % to complete [BR-09]'),
  'attendance.editWindowHours': define(
    positiveInt,
    48,
    'Hours after first marking during which a trainer may edit attendance [BR-06]',
  ),
  'attendance.lateCountsAsPresent': define(
    z.boolean(),
    true,
    'Whether LATE counts as attended in attendance % [BR-08]',
  ),
  'aggregate.minPercent': define(percent, 40, 'Minimum weighted aggregate % to complete [BR-09]'),
  'grade.bands': define(
    GradeBandsSchema,
    { A: 85, B: 70, C: 55, D: 40 },
    'Lower bound % of each grade; below D is Not Completed [BR-11]',
  ),
  'allocation.priorityRule': define(
    AllocationPriorityRuleSchema,
    'SUBMISSION_TIME',
    'Tie-break within a preference rank: earliest submission or highest CGPA [BR-04]',
  ),
  'allocation.previewTtlMinutes': define(
    positiveInt,
    30,
    'Minutes an allocation preview can be confirmed before it must be re-run [BRQ-4.2]',
  ),
  'institution.utcOffsetMinutes': define(
    z.number().int().min(-720).max(840),
    330,
    'Institution time zone as minutes from UTC (IST = 330); recurring sessions use it',
  ),
  'institution.name': define(
    z.string().trim().min(2).max(120),
    'Kalinga Institute of Social Sciences (KISS)',
    'Institution name printed on certificates [BRQ-7.2]',
  ),
  'competency.provisionalBands': define(
    z.object({ L2: percent, L3: percent, L4: percent }).refine((b) => b.L2 < b.L3 && b.L3 < b.L4, {
      message: 'Bands must be ascending (L2 < L3 < L4)',
    }),
    { L2: 40, L3: 60, L4: 85 },
    'Provisional level from linked assessment %: below L2 → 1, L2+ → 2, L3+ → 3, L4+ → 4 [F12]',
  ),
  'passport.shareDefaultDays': define(
    z.number().int().min(1).max(365),
    30,
    'Days a passport share link lasts when the student does not choose [BRQ-10.3]',
  ),
  'passport.shareMaxDays': define(
    z.number().int().min(1).max(3650),
    365,
    'Longest a passport share link may last [BRQ-10.3]',
  ),
  'scheduling.capacityWarnPercent': define(
    percent,
    90,
    'Warn when a batch is at least this % full [BRQ-14.1]',
  ),
  'evidence.maxBytes': define(
    z
      .number()
      .int()
      .min(1)
      .max(10 * 1024 * 1024),
    10 * 1024 * 1024,
    'Largest evidence file in bytes; the database also caps it at 10 MB [BRQ-18.1, NFR-14]',
  ),
  'evidence.allowedMime': define(
    z.array(z.string().regex(/^[a-z]+\/[a-z0-9.+-]+$/)).min(1),
    ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    'File types accepted as evidence; videos are links only [BRQ-18.1, NFR-14]',
  ),
  'evidence.uploadTtlSeconds': define(
    z.number().int().min(30).max(3600),
    600,
    'How long an evidence upload URL stays valid [TAD §9]',
  ),
  'evidence.downloadTtlSeconds': define(
    z.number().int().min(30).max(3600),
    300,
    'How long an evidence download link stays valid [TAD §9]',
  ),
  'enrollment.maxPreferences': define(
    z.number().int().min(1).max(3),
    3,
    'Maximum ranked course preferences per application [BRQ-3.1]',
  ),
  'risk.medium.attendanceBelow': define(percent, 80, 'Medium risk below this attendance % [BR-16]'),
  'risk.medium.consecutiveAbsences': define(
    positiveInt,
    3,
    'Medium risk at this many consecutive absences [BR-16]',
  ),
  'risk.medium.assessmentBelow': define(
    percent,
    50,
    'Medium risk when any assessment is below this % [BR-16]',
  ),
  'risk.high.attendanceBelow': define(percent, 75, 'High risk below this attendance % [BR-16]'),
  'risk.high.projectedBelow': define(
    percent,
    40,
    'High risk when projected aggregate is below this % [BR-16]',
  ),
  'risk.high.dropPoints': define(
    percent,
    15,
    'High risk on a drop of this many points between consecutive assessments [BR-16]',
  ),
  'risk.closeAfterClearDays': define(
    positiveInt,
    7,
    'Close a flag after its triggers stay clear this many days [BR-17]',
  ),
  'risk.escalateAfterDays': define(
    positiveInt,
    14,
    'Escalate an unresolved High flag to Admin after this many days [BR-17]',
  ),
  'auth.maxFailedLogins': define(
    positiveInt,
    5,
    'Failed logins before the account is locked [TAD §9]',
  ),
  'auth.lockMinutes': define(positiveInt, 15, 'Account lock duration in minutes [TAD §9]'),
  'auth.ipRateLimitPer15Min': define(
    positiveInt,
    50,
    'Failed sign-in attempts per 15 minutes per IP [TAD §9]',
  ),
  'public.rateLimitPerMin': define(
    positiveInt,
    30,
    'Requests per minute per IP on public endpoints [NFR-09]',
  ),
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>;
export type SettingsMap = { [K in SettingKey]: SettingValue<K> };

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS, key);
}

/** Validates a value for a key; throws ZodError on mismatch. */
export function parseSetting<K extends SettingKey>(key: K, value: unknown): SettingValue<K> {
  return SETTINGS[key].schema.parse(value) as SettingValue<K>;
}

export function defaultSettings(): SettingsMap {
  return Object.fromEntries(SETTING_KEYS.map((k) => [k, SETTINGS[k].default])) as SettingsMap;
}
