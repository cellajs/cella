import { attachmentEdit } from '../src/attachment-requests';
import { benchUser } from '../src/bench-user';
import { defineScenario } from '../src/runner';

/**
 * How many edits per second the mutation path takes (guard chain, RLS transaction, per-field merge). Each VU edits its
 * own attachment 20 times. Steps up 25 → 50 → 75 → 100 arrivals/s (~1200 req/s peak), past what a laptop takes.
 */
export default defineScenario({
  description: 'Attachment edit: the write path under a step-up, one rename per request.',
  phases: [
    { name: 'hold 25', duration: 10, arrivalRate: 25 },
    { name: 'hold 50', duration: 10, arrivalRate: 50 },
    { name: 'hold 75', duration: 10, arrivalRate: 75 },
    { name: 'hold 100', duration: 10, arrivalRate: 100 },
  ],
  counters: ['bench.rows_written'],
  checks: { maxErrorRate: 1, thresholds: { 'http.response_time.p95': 3000 } },
  async vu(vu) {
    const { cookie, userIndex } = benchUser(vu.index);
    for (let i = 0; i < 20; i++) {
      const { path, json } = attachmentEdit(userIndex);
      const res = await vu.http.put(path, { json, headers: { cookie }, name: 'PUT /attachments/:id' });
      if (res.status === 200) vu.counter('bench.rows_written');
      await vu.think(50);
    }
  },
});
