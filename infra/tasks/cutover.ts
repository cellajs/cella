/**
 * Explicit LB-overlap cutover controller for the immutable-node model.
 *
 * Every release provisions a NEW VM generation (`vm-<svc>-<gen>`) with the image
 * SHA baked into its cloud-init. This task can health-gate that new generation
 * and atomically re-point the load balancer from the old generation to the new
 * one, draining the old before CI destroys it. deploy.yml calls
 * tasks/deploy-service.ts, which wraps this controller with Pulumi create/destroy
 * bookends and stack-output discovery.
 *
 * Design:
 *   - PURE CORE — `expandBackend` / `contractBackend` / `pollSlotReleased` /
 *     `sequenceCutover` orchestrate the rollout over INJECTED effects, so the
 *     ordering (expand BEFORE contract, health before contract, drain BEFORE
 *     destroy) is fully unit-testable with a fake LB + fetch.
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

/** Read the backend's current server list. */
export type GetServersFn = () => Promise<string[]>

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
  /** lb-overlap: read the current LB server list for idempotent resume. */
  getServers?: GetServersFn
  /** lb-overlap: run health/version polling after attaching the new generation to the LB. */
  healthAfterExpand?: boolean
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
  aborted?: 'unhealthy' | 'slot-stuck' | 'unexpected-lb-state'
  /** Ordered record of the steps performed — asserted by the unit tests. */
  steps: string[]
}

/**
 * Run a single service's cutover. The new generation VM already exists (created
 * by the `pulumi up` bookend); this gates it healthy and re-points traffic.
 *
 * lb-overlap:  health-gate → expand [old,new] → reattach internal IP → contract [new] → drain
 *              or expand → health-gate → reattach → contract when CI must probe through the public LB
 * exclusive:   health-gate(process up) → drain+destroy old → slot released → (new acquires)
 *
 * With a direct new-generation probe, an unhealthy generation aborts before any
 * LB mutation. With `healthAfterExpand`, the new generation is first attached
 * to the LB and the public endpoint is polled until the LB can serve the new
 * SHA; failure leaves the LB in the safe expanded state for manual diagnosis.
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

  if (!plan.healthAfterExpand) {
    record('health-gate new generation (/health == SHA)')
    if (!(await plan.healthGate())) return { ok: false, aborted: 'unhealthy', steps }
  }

  if (!plan.setServers) throw new Error(`cutover: lb-overlap service '${plan.service}' requires a setServers effect`)
  const setServers = plan.setServers

  const sameIps = (actual: string[], expected: string[]) => {
    const normalize = (ips: string[]) => [...ips].sort().join(',')
    return normalize(actual) === normalize(expected)
  }
  const oldAndNew = [...plan.oldIps, ...plan.newIps]
  const currentServers = plan.getServers ? await plan.getServers() : plan.oldIps

  if (sameIps(currentServers, plan.newIps)) {
    record('LB already contracted to [new]')
    return { ok: true, steps }
  }

  if (!sameIps(currentServers, plan.oldIps) && !sameIps(currentServers, oldAndNew)) {
    record(`unexpected LB server list: ${currentServers.join(',') || '<empty>'}`)
    return { ok: false, aborted: 'unexpected-lb-state', steps }
  }

  if (sameIps(currentServers, oldAndNew)) {
    record('LB already expanded to [old, new]')
  } else {
    record(`expand LB to [old, new] (${oldAndNew.length} servers)`)
    await expandBackend(setServers, plan.oldIps, plan.newIps)
  }

  if (plan.healthAfterExpand) {
    record('health-gate new generation (/health == SHA)')
    if (!(await plan.healthGate())) return { ok: false, aborted: 'unhealthy', steps }
  }

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

function scalewayResourceId(id: string): string {
  return id.split('/').at(-1) ?? id
}

/** Build the live `SetServersFn` that re-points one Scaleway LB backend. */
export function createLbSetServers(opts: LbSetServersOptions): SetServersFn {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  const backendId = scalewayResourceId(opts.backendId)
  const url = `${LB_BASE}/zones/${opts.zone}/backends/${backendId}/servers`
  return async (serverIps) => {
    const res = await fetchImpl(url, {
      method: 'PUT',
      headers: { 'X-Auth-Token': opts.secretKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ server_ip: serverIps }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`SetBackendServers ${backendId} → ${res.status}: ${body}`)
    }
  }
}

function parseBackendServers(payload: string): string[] {
  const data = JSON.parse(payload) as {
    backend?: unknown
    server_ip?: string[]
    server_ips?: string[]
    serverIps?: string[]
    servers?: Array<string | { ip?: string; serverIp?: string; server_ip?: string }>
  }
  const backend = (data.backend ?? data) as typeof data
  if (Array.isArray(backend.server_ip)) return backend.server_ip
  if (Array.isArray(backend.server_ips)) return backend.server_ips
  if (Array.isArray(backend.serverIps)) return backend.serverIps
  if (Array.isArray(backend.servers)) {
    return backend.servers.map((server) => typeof server === 'string' ? server : (server.ip ?? server.serverIp ?? server.server_ip ?? '')).filter(Boolean)
  }
  return []
}

export function createLbGetServers(opts: LbSetServersOptions): GetServersFn {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  const backendId = scalewayResourceId(opts.backendId)
  const url = `${LB_BASE}/zones/${opts.zone}/backends/${backendId}`
  return async () => {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { 'X-Auth-Token': opts.secretKey, 'Content-Type': 'application/json' },
    })
    const body = await res.text()
    if (!res.ok) throw new Error(`ListBackendServers ${backendId} → ${res.status}: ${body}`)
    return parseBackendServers(body)
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
    getServers: strategy === 'lb-overlap' ? createLbGetServers({ secretKey: secretKey!, zone: getFlag(argv, '--lb-zone')!, backendId: getFlag(argv, '--backend-id')! }) : undefined,
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
