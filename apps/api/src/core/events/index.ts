import { logger } from '../logger';

type BatchHandler = (batchId: string) => Promise<unknown>;

const handlers = new Set<BatchHandler>();

/**
 * "A batch's attendance, marks or ratings changed." Core modules announce it after their
 * transaction commits; innovation modules (F11) subscribe when routes are wired, so core never
 * imports them (CLAUDE.md rule 5).
 *
 * Handlers are awaited before the request responds, because a serverless function may be
 * frozen once the response is sent. A failing handler is logged and never fails the save that
 * already committed; the daily run catches up.
 */
export const batchEvents = {
  onDataChanged(handler: BatchHandler): void {
    handlers.add(handler);
  },
  async dataChanged(batchId: string): Promise<void> {
    for (const handler of handlers) {
      try {
        await handler(batchId);
      } catch (err) {
        logger.error({ err, batchId }, 'batch data-changed handler failed');
      }
    }
  },
};

type CertificateHandler = (enrollmentId: string) => Promise<unknown>;

const certificateHandlers = new Set<CertificateHandler>();

/**
 * "A certificate was issued." The completion module announces it after the certificate is
 * stored; the automation module refreshes outcome analytics from it (A8). Same rules as
 * batchEvents: awaited, and a failing handler never fails the issue.
 */
export const certificateEvents = {
  onIssued(handler: CertificateHandler): void {
    certificateHandlers.add(handler);
  },
  async issued(enrollmentId: string): Promise<void> {
    for (const handler of certificateHandlers) {
      try {
        await handler(enrollmentId);
      } catch (err) {
        logger.error({ err, enrollmentId }, 'certificate-issued handler failed');
      }
    }
  },
};
