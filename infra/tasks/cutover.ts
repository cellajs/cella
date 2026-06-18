/**
 * Zero-downtime cutover — the single deploy driver for the immutable-node model.
 *
 * Every release provisions a NEW VM generation (`vm-<svc>-<gen>`) with the image
 * SHA baked into its cloud-init. This task health-gates that new generation and
 * atomically re-points the load balancer from the old generation to the new one,
 * draining the old before CI destroys it. It replaces the pull-based reconciler:
 * CI is now the synchronous deploy driver.
 *
 * Design (see info/ZERO_DOWNTIME_REPLACEMENT.md §2, §6.1, §10):
 *   - PURE CORE — `expandBackend` / `contractBackend` / `pollSlotReleased` /
 *     `sequenceCutover` orchestrate the rollout over INJECTED effects, so the
 *     ordering (health-gate BEFORE any LB mutation, expand BEFORE contract,
 *     drain BEFORE destroy) is fully unit-testable with a fake LB + fetch.
 *   - IMPURE EDGES — `createLbSetServers` (direct Scaleway `SetBackendServers`
 *     REST call) and the `pulumi up` create/destroy bookends in the entrypoint.
 *     These touch live infra and are exercised only in a real deploy / preview,
 *     never in the unit tests.
 *
 * The LB re-point is the atomic primitive: `SetBackendServers` replaces the whole
 * backend server list server-side in one call. Near-zero-drop comes from
 * expand-then-contract — `[old, new]` (overlap while new health-checks UP) then
 * `[new]` (old removed, in-flight connections drain).
 *
 * cdc is `exclusive`, not `lb-overlap`: it holds one PostgreSQL replication slot
 * that Postgres permits exactly one consumer for, so there is no LB and no
 * overlap. The old worker must release the slot before the new one can acquire
 * it; the new generation only reports `/health` healthy once it holds the slot,
 * so "destroy old → poll new healthy" confirms the handoff (the `pollSlotReleased`
 * helper is the belt-and-suspenders Postgres-level gate when a checker is wired).
 *
 * Usage:
 *   tsx infra/tasks/cutover.ts --service backend --sha <git-sha> \
 *     --strategy lb-overlap --drain-policy requests \
 *     --lb-zone fr-par-1 --backend-id <uuid> \
 *     --health-url https://api.example/health \
 *     --old-ips 10.0.0.4 --new-ips 10.0.0.9 --drain-seconds 10
 *   (SCW_SECRET_KEY in env for the live LB call)
 */
import { pathToFileURL } from 'node:url'
import { getFlag, getNumFlag, sleep as defaultSleep } from './args'
import { createFetchProbe, pollForVersion } from './wait-for-version'

// ---------------------------------------------------------------------------
// Strategy vocabulary (mirrors config/services.config.ts `replacementStrategy`
// + `drainPolicy`). Kept as standalone literals so the pure core never imports
// the Pulumi-bound registry.
// ---------------------------------------------------------------------------

/** How a service's VM generation is cut over on a deploy. */
export type ReplacementStrategy = 'lb-overlap' | 'exclusive'

/** How the old generation is drained off the LB when it is de-registered. */
export type DrainPolicy = 'requests' | 'reconnect'

// ---------------------------------------------------------------------------
// Injected effects — every side effect the rollout performs is a function the
// caller supplies, so the sequencer is pure and the tests assert ordering.
// ---------------------------------------------------------------------------

/** Atomically replace a backend's entire server list (Scaleway SetBackendServers). */
export type SetServersFn = (serverIps: string[]) => Promise<void>

/** Resolve true once the new generation is serving the expected release (app /health gate). */
export type HealthGateFn = () => Promise<boolean>

/** Resolve true while the replication slot is still held by the old consumer. */
export type SlotActiveFn = () => Promise<boolean>

/** Minimal `fetch` surface so the live LB call is unit-testable. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>

// ---------------------------------------------------------------------------
// Pure LB operations — one atomic `SetBackendServers` call each.
// ---------------------------------------------------------------------------

/** Expand the backend to serve BOTH generations (overlap window). */
export async function expandBackend(setServers: SetServersFn, oldIps: string[], newIps: string[]): Promise<void> {
  await setServers([...oldIps, ...newIps])
}

/** Contract the backend to serve ONLY the new generation (old removed, drains). */
export async function contractBackend(setServers: SetServersFn, newIps: string[]): Promise<void> {
  await setServers(newIps)
}

// ---------------------------------------------------------------------------
// Pure slot-release gate (exclusive / cdc). Polls until the old consumer has
// released the slot, so the deploy never destroys a generation while it still
// holds WAL. Bounded — exhausting the budget FAILS the deploy rather than
// proceeding (a stuck old worker would otherwise bloat WAL on disk).
// ---------------------------------------------------------------------------

export interface PollSlotOptions {
  isSlotActive: SlotActiveFn
  attempts?: number
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
  log?: (msg: string) => void
}

/** True once the slot is released; false if the budget is exhausted while still active. */
export async function pollSlotReleased(opts: PollSlotOptions): Promise<boolean> {
  const attempts = opts.attempts ?? 12
  const intervalMs = opts.intervalMs ?? 5000
  const sleep = opts.sleep ?? defaultSleep
  const log = opts.log ?? ((msg: string) => console.info(msg))

  for (let i = 1; i <= attempts; i++) {
    if (!(await opts.isSlotActive())) {
      log(`Replication slot released after ${i} attempt(s)`)
      return true
    }
    log(`Attempt ${i}/${attempts}: replication slot still active — waiting for old consumer to release`)
    if (i < attempts) await sleep(intervalMs)
  }
  return false
}

// ---------------------------------------------------------------------------
// The sequencer — orders the rollout steps over injected effects. Never touches
// the network or a subprocess itself; that is the entrypoint's job.
// ---------------------------------------------------------------------------

export interface CutoverPlan {
  service: string
  strategy: ReplacementStrategy
  /** Drain semantics for the old generation (logged; the LB resource carries onMarkedDownAction). */
  drainPolicy?: DrainPolicy
  /** Active generation IP(s) currently behind the LB (empty for a first deploy). */
  oldIps: string[]
  /** New generation IP(s) to cut over to. */
  newIps: string[]
  /** Seconds to let the old generation drain after it is de-registered. */
  drainSeconds: number

  // --- injected effects ---
  /** Gate: resolves true once the new generation serves the expected SHA. Required. */
  healthGate: HealthGateFn
  /** lb-overlap: replace the LB backend server list atomically. Required for lb-overlap. */
  setServers?: SetServersFn
  /** backend only: move the stable internal IP onto the new generation (after health, before contract). */
  reattachInternalIp?: () => Promise<void>
  /** exclusive: trigger the old generation to stop and release the slot (in practice, the pulumi destroy bookend). */
  drainOldGeneration?: () => Promise<void>
  /** exclusive: belt-and-suspenders Postgres-level slot-release gate. */
  isSlotActive?: SlotActiveFn

  sleep?: (ms: number) => Promise<void>
  log?: (msg: string) => void
}

export interface CutoverResult {
  ok: boolean
  /** Why the cutover stopped, when not ok. */
  aborted?: 'unhealthy' | 'slot-stuck'
  /** Ordered record of the steps performed — asserted by the unit tests. */
  steps: string[]
}

/**
 * Run a single service's cutover. The new generation VM already exists (created
 * by the `pulumi up` bookend); this gates it healthy and re-points traffic.
 *
 * lb-overlap:  health-gate → expand [old,new] → reattach internal IP → contract [new] → drain
 * exclusive:   health-gate(process up) → drain+destroy old → slot released → (new acquires)
 *
 * On an unhealthy new generation the cutover aborts BEFORE any LB mutation, so
 * the old generation keeps serving and there is no outage.
 */
export async function sequenceCutover(plan: CutoverPlan): Promise<CutoverResult> {
  const sleep = plan.sleep ?? defaultSleep
  const log = plan.log ?? ((msg: string) => console.info(msg))
  const steps: string[] = []
  const record = (step: string) => {
    steps.push(step)
    log(`[cutover ${plan.service}] ${step}`)
  }

  if (plan.strategy === 'exclusive') {
    // cdc: no LB, no overlap. The new worker is warm and idle-contending for the
    // slot; the old worker must release it first.
    record('health-gate new generation (process up)')
    if (!(await plan.healthGate())) return { ok: false, aborted: 'unhealthy', steps }

    record('drain + destroy old generation (releases slot)')
    await plan.drainOldGeneration?.()

    if (plan.isSlotActive) {
      record('gate on Postgres slot release')
      const released = await pollSlotReleased({ isSlotActive: plan.isSlotActive, sleep, log })
      if (!released) return { ok: false, aborted: 'slot-stuck', steps }
    }
    record('new generation acquires slot')
    return { ok: true, steps }
  }

  // lb-overlap: the new generation must serve the expected SHA BEFORE we touch
  // the LB, so a bad release never removes a healthy server.
  record('health-gate new generation (/health == SHA)')
  if (!(await plan.healthGate())) return { ok: false, aborted: 'unhealthy', steps }

  if (!plan.setServers) throw new Error(`cutover: lb-overlap service '${plan.service}' requires a setServers effect`)
  const setServers = plan.setServers

  record(`expand LB to [old, new] (${plan.oldIps.length + plan.newIps.length} servers)`)
  await expandBackend(setServers, plan.oldIps, plan.newIps)

  if (plan.reattachInternalIp) {
    record('reattach stable internal IP to new generation')
    await plan.reattachInternalIp()
  }

  record('contract LB to [new]')
  await contractBackend(setServers, plan.newIps)

  record(`drain old generation for ${plan.drainSeconds}s (drainPolicy=${plan.drainPolicy ?? 'requests'})`)
  if (plan.drainSeconds > 0) await sleep(plan.drainSeconds * 1000)

  return { ok: true, steps }
}

// ---------------------------------------------------------------------------
// Impure edge — the real Scaleway `SetBackendServers` REST call.
//
// PUT /lb/v1/zones/{zone}/backends/{backendId}/servers   body: { server_ip: [...] }
// replaces the whole server list in one atomic server-side operation (Scaleway
// Load Balancer zoned API v1). Preview-gated: exercised only in a live deploy,
// never by the unit tests (which inject `setServers`).
// ---------------------------------------------------------------------------

const LB_BASE = 'https://api.scaleway.com/lb/v1'

export interface LbSetServersOptions {
  secretKey: string
  zone: string
  backendId: string
  fetchImpl?: FetchLike
}

/** Build the live `SetServersFn` that re-points one Scaleway LB backend. */
export function createLbSetServers(opts: LbSetServersOptions): SetServersFn {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  const url = `${LB_BASE}/zones/${opts.zone}/backends/${opts.backendId}/servers`
  return async (serverIps) => {
    const res = await fetchImpl(url, {
      method: 'PUT',
      headers: { 'X-Auth-Token': opts.secretKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ server_ip: serverIps }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`SetBackendServers ${opts.backendId} → ${res.status}: ${body}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Standalone entry point — wires the live effects and runs the cutover. The
// `pulumi up` create/destroy bookends are CI-orchestrated around this call
// (see .github/workflows/deploy.yml), keeping subprocess calls out of the core.
// ---------------------------------------------------------------------------

function parseIps(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter((ip) => ip.length > 0)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2)
  const service = getFlag(argv, '--service')
  const sha = getFlag(argv, '--sha')
  const strategy = getFlag(argv, '--strategy') as ReplacementStrategy | undefined
  const drainPolicy = (getFlag(argv, '--drain-policy') as DrainPolicy | undefined) ?? 'requests'
  const healthUrl = getFlag(argv, '--health-url')
  const oldIps = parseIps(getFlag(argv, '--old-ips'))
  const newIps = parseIps(getFlag(argv, '--new-ips'))
  const drainSeconds = getNumFlag(argv, '--drain-seconds', 10)
  const secretKey = process.env.SCW_SECRET_KEY

  if (!service || !sha || !strategy || !healthUrl) {
    process.stderr.write('Required: --service, --sha, --strategy, --health-url\n')
    process.exit(2)
  }
  if (strategy !== 'lb-overlap' && strategy !== 'exclusive') {
    process.stderr.write(`Unknown --strategy '${strategy}' (expected lb-overlap | exclusive)\n`)
    process.exit(2)
  }

  const healthGate: HealthGateFn = async () => {
    const outcome = await pollForVersion({
      url: healthUrl,
      expectedSha: sha,
      probe: createFetchProbe(8000),
    })
    return outcome.ok
  }

  let setServers: SetServersFn | undefined
  if (strategy === 'lb-overlap') {
    const zone = getFlag(argv, '--lb-zone')
    const backendId = getFlag(argv, '--backend-id')
    if (!zone || !backendId || !secretKey) {
      process.stderr.write('lb-overlap requires: --lb-zone, --backend-id, SCW_SECRET_KEY\n')
      process.exit(2)
    }
    setServers = createLbSetServers({ secretKey, zone, backendId })
  }

  const result = await sequenceCutover({
    service,
    strategy,
    drainPolicy,
    oldIps,
    newIps,
    drainSeconds,
    healthGate,
    setServers,
  })

  if (!result.ok) {
    process.stderr.write(
      `::error::Cutover of ${service} to ${sha} aborted (${result.aborted}). ` +
        'The previous generation is still serving — no outage. See the new generation logs (serial console) for the cause.\n',
    )
    process.exit(1)
  }
  process.stdout.write(`✓ Cutover of ${service} to ${sha} complete (${result.steps.length} steps)\n`)
}
