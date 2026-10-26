import { z } from 'zod';

/** BRQ-18.2: a rubric is named criteria scored on ordered levels. */
export const RubricSchema = z
  .object({
    criteria: z
      .array(
        z
          .object({
            key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'Use lowercase letters, digits, _'),
            name: z.string().trim().min(2).max(80),
            description: z.string().trim().max(300).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12)
      .refine(
        (c) => new Set(c.map((x) => x.key)).size === c.length,
        'Criterion keys must be unique',
      ),
    levels: z
      .array(
        z
          .object({
            value: z.number().int().min(1).max(10),
            label: z.string().trim().min(1).max(40),
          })
          .strict(),
      )
      .min(2)
      .max(6)
      .refine(
        (l) => l.every((x, i) => i === 0 || x.value > l[i - 1]!.value),
        'Levels must be in ascending order',
      ),
  })
  .strict();
export type RubricInput = z.infer<typeof RubricSchema>;

export interface RubricDto extends RubricInput {
  id: string;
  assessmentId: string;
  updatedAt: string;
}

/** POST /evidence/upload-url: what the trainer is about to upload. */
export const UploadUrlSchema = z
  .object({
    resultId: z.string().uuid(),
    fileName: z.string().trim().min(1).max(200),
    contentType: z.string().trim().min(3).max(100),
    sizeBytes: z.number().int().positive(),
  })
  .strict();
export type UploadUrlInput = z.infer<typeof UploadUrlSchema>;

/**
 * Where the browser sends the file (never through the API function). `vercel-blob`: use the
 * client token with @vercel/blob's client `put`; `local` (development): PUT the bytes to `url`.
 */
export type UploadTarget =
  | { driver: 'vercel-blob'; key: string; clientToken: string; expiresAt: string }
  | { driver: 'local'; key: string; url: string; expiresAt: string };

/** POST /results/:resultId/evidence: a stored file or a video link, plus rubric scores. */
export const EvidenceAttachSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('FILE'),
      key: z.string().min(1).max(300),
      fileName: z.string().trim().min(1).max(200),
      competencyId: z.string().uuid().optional(),
      scores: z.record(z.string(), z.number().int()).optional(),
      note: z.string().trim().max(1000).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('LINK'),
      url: z
        .string()
        .url()
        .max(500)
        .refine((u) => u.startsWith('https://'), 'Use an https:// link'),
      competencyId: z.string().uuid().optional(),
      scores: z.record(z.string(), z.number().int()).optional(),
      note: z.string().trim().max(1000).optional(),
    })
    .strict(),
]);
export type EvidenceAttachInput = z.infer<typeof EvidenceAttachSchema>;

export interface EvidenceDto {
  id: string;
  resultId: string;
  kind: 'FILE' | 'LINK';
  fileName: string | null;
  mime: string | null;
  sizeBytes: number | null;
  /** LINK only; files are opened through a short-lived signed URL. */
  url: string | null;
  competency: { id: string; code: string; title: string } | null;
  scores: Record<string, number> | null;
  note: string | null;
  uploadedBy: string;
  createdAt: string;
}

/** A practical assessment's results with their evidence, for the trainer's evidence screen. */
export interface EvidenceSheet {
  assessmentId: string;
  title: string;
  rubric: RubricDto | null;
  competencies: Array<{ id: string; code: string; title: string }>;
  rows: Array<{
    resultId: string;
    studentId: string;
    rollNo: string;
    fullName: string;
    marks: number;
    evidence: EvidenceDto[];
  }>;
}

export interface SignedFileUrl {
  url: string;
  expiresAt: string;
}
