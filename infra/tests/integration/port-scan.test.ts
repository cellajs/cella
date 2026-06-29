/**
 * Port-closed integration test — verifies that the listed dangerous ports are
 * NOT publicly reachable on the live host.
 *
 * Skipped by default. Opt in by setting `STAGING_HOST=<ip-or-fqdn>` before
 * running the suite. Excluded from the default `pnpm test` run via the
 * `tests/integration/**` exclude in `vitest.config.ts`; run it explicitly with
 * `pnpm test:integration` (see `infra/package.json`).
 *
 * Behavior per port:
 *   - `connect` error (ECONNREFUSED / EHOSTUNREACH / ETIMEDOUT) → PASS
 *   - successful TCP handshake → FAIL (port should not be open to the world)
 *
 * Uses raw `net.createConnection` so the test has no third-party deps.
 */
import * as net from 'node:net'
import { describe, expect, it } from 'vitest'

const HOST = process.env.STAGING_HOST
const PORTS_THAT_MUST_BE_CLOSED = [
  22, // SSH — break-glass is serial console only
  5432, // PostgreSQL — private network only
  6432, // PgBouncer (if used)
  6379, // Redis — not exposed
  9090, // Prometheus / Cockpit metrics
]
const TIMEOUT_MS = 3000

function probe(host: string, port: number): Promise<'closed' | 'open' | 'timeout'> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: TIMEOUT_MS })
    let done = false
    const finish = (result: 'closed' | 'open' | 'timeout') => {
      if (done) return
      done = true
      socket.destroy()
      resolve(result)
    }
    socket.once('connect', () => finish('open'))
    socket.once('error', () => finish('closed'))
    socket.once('timeout', () => finish('timeout'))
  })
}

describe.skipIf(!HOST)('port-closed scan against $STAGING_HOST', () => {
  for (const port of PORTS_THAT_MUST_BE_CLOSED) {
    it(`port ${port} is not publicly reachable`, async () => {
      const result = await probe(HOST!, port)
      // 'timeout' from a stateful firewall is also acceptable (the firewall
      // dropped the SYN). Only an explicit handshake fails the test.
      expect(result, `port ${port} unexpectedly reachable on ${HOST}`).not.toBe('open')
    })
  }
})
