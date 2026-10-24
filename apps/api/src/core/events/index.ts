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
