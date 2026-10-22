import { benchUser } from '../src/bench-user';
import { defineScenario } from '../src/runner';

/**
 * What the guard chain alone costs. `/me` reads nothing beyond the session and the memberships the guards load and
 * cache, so its ceiling is that of the API process, not of the database. Each VU loops 20 times; sustained at 100
 * arrivals/s (~2000 req/s).
 */
export default defineScenario({
  description: 'GET /me: the cheapest signed-in request, repeated.',
  phases: [
    { name: 'ramp up', duration: 10, arrivalRate: 50 },
    { name: 'sustained', duration: 15, arrivalRate: 100 },
  ],
  checks: { thresholds: { 'http.response_time.p95': 500, 'http.response_time.p99': 1000 } },
  async vu(vu) {
    const { cookie } = benchUser(vu.index);
    for (let i = 0; i < 20; i++) {
      await vu.http.get('/me', { headers: { cookie }, name: 'GET /me' });
      await vu.think(10);
    }
  },
});
