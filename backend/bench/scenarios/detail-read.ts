import { defineScenario } from '@cellajs/cli/bench';
import { benchUser, ORG_PATH } from '../bench-user';
import { attachmentId } from '../seeds/ids';

/**
 * Many signed-in readers of one row at once, as when a link is opened by many at once. Each
 * read runs the route's own queries: the row under the caller's access, its writers and its view count. After a
 * warm-up, 300 VUs arrive within half a second and each reads the one attachment 10 times back to back.
 */
export default defineScenario({
  description: 'Detail read: a few hundred signed-in readers of one attachment at once.',
  phases: [
    { name: 'warm up', duration: 5, arrivalRate: 10 },
    { name: 'stampede', duration: 0.5, arrivalCount: 300 },
  ],
  checks: { maxErrorRate: 1, thresholds: { 'http.response_time.p95': 500, 'http.response_time.p99': 1000 } },
  async vu(vu) {
    const { cookie } = benchUser(vu.index);
    for (let i = 0; i < 10; i++) {
      await vu.http.get(`${ORG_PATH}/attachments/${attachmentId(0)}`, { headers: { cookie }, name: 'GET /attachments/:id' });
    }
  },
});
