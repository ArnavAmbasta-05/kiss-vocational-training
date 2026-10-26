import { z } from 'zod';

export const ASSISTANT_MODES = ['answer', 'practice', 'simplify'] as const;
export type AssistantMode = (typeof ASSISTANT_MODES)[number];

/** POST /assistant/ask (F17). */
export const AskSchema = z
  .object({
    question: z.string().trim().min(3).max(1000),
    mode: z.enum(ASSISTANT_MODES).default('answer'),
  })
  .strict();
export type AskInput = z.infer<typeof AskSchema>;

/** An excerpt the answer is based on (BRQ-17.1: cite the source). */
export interface AssistantSource {
  /** 1-based number used in the answer's [1], [2] citations. */
  n: number;
  chunkId: string;
  materialId: string;
  materialTitle: string;
  excerpt: string;
}

export interface PracticeQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  /** Source number the question is based on. */
  source: number;
}

/**
 * Why the assistant gave no model answer. The web app renders each code in the student's
 * language; nothing here comes from the model.
 */
export type AssistantRefusal = 'NOT_IN_MATERIALS' | 'NO_COURSE' | 'OFF_TOPIC';

export interface AssistantReply {
  mode: AssistantMode;
  refused: AssistantRefusal | null;
  /** Answer or simplified explanation with [n] citations (answer / simplify modes). */
  answer: string | null;
  /** Practice mode only. */
  questions: PracticeQuestion[] | null;
  sources: AssistantSource[];
  /** BRQ-17.4: approved resources for the student's skill gaps (from F12, not the model). */
  resources: Array<{ id: string; title: string; type: string; url: string }>;
  remainingToday: number;
}

export interface AssistantStatus {
  enabled: boolean;
  /** Courses the student can ask about (those with approved materials). */
  courses: Array<{ id: string; title: string; materials: number }>;
  remainingToday: number;
  dailyLimit: number;
}

// ─── Materials (admin) ─────────────────────────────────────────────────────────

export const MATERIAL_MIME = ['application/pdf', 'text/plain', 'text/markdown'] as const;

export const MaterialUploadUrlSchema = z
  .object({
    courseId: z.string().uuid(),
    fileName: z.string().trim().min(1).max(200),
    contentType: z.enum(MATERIAL_MIME),
    sizeBytes: z.number().int().positive(),
  })
  .strict();
export type MaterialUploadUrlInput = z.infer<typeof MaterialUploadUrlSchema>;

export const MaterialCreateSchema = z
  .object({
    courseId: z.string().uuid(),
    title: z.string().trim().min(2).max(200),
    key: z.string().min(1).max(300),
  })
  .strict();
export type MaterialCreateInput = z.infer<typeof MaterialCreateSchema>;

export interface MaterialDto {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  mime: string;
  sizeBytes: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  chunkCount: number;
  uploadedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

/** Admin usage figures for the current calendar month (BRQ-17.5). */
export interface AssistantUsage {
  enabled: boolean;
  month: string;
  questions: number;
  answered: number;
  refusals: Record<string, number>;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  monthlyCapUsd: number;
  averageLatencyMs: number | null;
  byMode: Record<string, number>;
}
