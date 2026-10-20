import { benchUser, ORG_PATH } from '../src/bench-user';
import { defineScenario } from '../src/runner';

/**
 * How the read path holds when every visitor also reads data. On top of /me, /me/memberships and /organizations, each
 * load fetches the first page of the organization's attachments: a product read, which runs in a row-level-security
 * transaction. Each VU loads the page 15 times. Steps up 10 → 15 → 20 arrivals/s (150 → 300 page loads/s, ~1200 req/s
 * peak), about two thirds of what one API process serves on a laptop.
 */
export default defineScenario({
  description: 'Page load: what a tab fetches when it opens an organization.',
  phases: [
    { name: 'hold 10', duration: 10, arrivalRate: 10 },
    { name: 'hold 15', duration: 10, arrivalRate: 15 },
    { name: 'hold 20', duration: 15, arrivalRate: 20 },
  ],
  checks: { maxErrorRate: 1, thresholds: { 'http.response_time.p95': 500, 'http.response_time.p99': 1000 } },
  async vu(vu) {
    const { cookie } = benchUser(vu.index);
    const headers = { cookie };
    for (let i = 0; i < 15; i++) {
      await vu.http.get('/me', { headers, name: 'GET /me' });
      await vu.http.get('/me/memberships', { headers, name: 'GET /me/memberships' });
      await vu.http.get('/organizations', { headers, name: 'GET /organizations' });
      await vu.http.get(`${ORG_PATH}/attachments?limit=40`, { headers, name: 'GET /attachments' });
      await vu.think(100);
    }
  },
});
