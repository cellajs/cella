import { CHURN_BATCH_SIZE, churnBatch } from '../src/attachment-requests';
import { benchUser, ORG_PATH } from '../src/bench-user';
import { defineScenario } from '../src/runner';

interface BatchResponse {
  data?: unknown[];
  rejectedIds?: string[];
}

const parseBatch = (text: string): BatchResponse => {
  try {
    return JSON.parse(text) as BatchResponse;
  } catch {
    return {};
  }
};

/**
 * Whether the insert and delete path holds its books under load: multi-row creates and deletes reach the CDC worker as
 * batches. Each VU creates a batch of 10 and deletes it, 5 times. Steps up 5 → 10 arrivals/s (~1000 rows/s peak).
 */
export default defineScenario({
  description: 'Attachment churn: batches of 10 attachments are created and deleted again.',
  phases: [
    { name: 'hold 5', duration: 10, arrivalRate: 5 },
    { name: 'hold 10', duration: 20, arrivalRate: 10 },
  ],
  counters: ['bench.rows_written', 'bench.rows_created.attachment', 'bench.rows_deleted.attachment'],
  checks: { maxErrorRate: 1 },
  async vu(vu) {
    const { cookie } = benchUser(vu.index);
    for (let i = 0; i < 5; i++) {
      const { create, remove } = churnBatch();
      const created = await vu.http.post(`${ORG_PATH}/attachments`, { json: create, headers: { cookie }, name: 'POST /attachments' });
      const inserted = created.ok ? (parseBatch(created.text()).data?.length ?? 0) : 0;
      if (inserted > 0) {
        vu.counter('bench.rows_written', inserted);
        vu.counter('bench.rows_created.attachment', inserted);
      }
      const deleted = await vu.http.delete(`${ORG_PATH}/attachments`, { json: remove, headers: { cookie }, name: 'DELETE /attachments' });
      const removed = deleted.ok ? CHURN_BATCH_SIZE - (parseBatch(deleted.text()).rejectedIds?.length ?? 0) : 0;
      if (removed > 0) {
        vu.counter('bench.rows_written', removed);
        vu.counter('bench.rows_deleted.attachment', removed);
      }
      await vu.think(100);
    }
  },
});
