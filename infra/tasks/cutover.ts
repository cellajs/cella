import { type FetchLike, resolveFetch } from '../lib/utils/fetch-like'
import { isRecord } from '../lib/utils/guards'
import { isMain } from '../lib/utils/is-main'
// The canonical strategy vocabulary lives on the Compose model (`x-service`
// metadata). types.ts is Pulumi-free, so the pure core can import it directly
// without silently forking the unions.
import type { DrainPolicy, ReplacementStrategy } from '../compose/types'
import { getFlag, getNumFlag, sleep as defaultSleep } from './args'
import { createFetchProbe, pollForVersion } from './wait-for-version'

export type { DrainPolicy, ReplacementStrategy }

/** Atomically replace a backend's entire server list (Scaleway SetBackendServers). */
export type SetServersFn = (serverIps: string[]) => Promise<void>

/** Read the backend's current server list. */
export type GetServersFn = () => Promise<string[]>

/** Resolve true once the new generation is serving the expected release (app /health gate). */
export type HealthGateFn = () => Promise<boolean>

// Pure LB operations: one atomic `SetBackendServers` call each.

/** Contract the backend to serve ONLY the new generation (old removed, drains). */
export async function contractBackend(setServers: SetServersFn, newIps: string[]): Promise<void> {
  await setServers(newIps)
}

// The sequencer: orders the rollout steps over injected effects. Never touches
// the network or a subprocess itself; that is the entrypoint's job.

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

  // Injected effects
  /** Gate: resolves true once the new generation serves the expected SHA. Required. */
  healthGate: HealthGateFn
  /** lb-overlap: replace the LB backend server list atomically. Required for lb-overlap. */
  setServers?: SetServersFn
  /** lb-overlap: read the current LB server list for idempotent resume. */
  getServers?: GetServersFn
  /** lb-overlap: run health/version polling after attaching the new generation to the LB. */
  healthAfterExpand?: boolean

  sleep?: (ms: number) => Promise<void>
  log?: (msg: string) => void
}

export interface CutoverResult {
  ok: boolean
  /** Why the cutover stopped, when not ok. */
  aborted?: 'unhealthy'
  /** Ordered list of the steps performed; asserted by the unit tests. */
  steps: string[]
}

/**
 * Run a single service's cutover. Every release provisions a new VM generation
 * (`vm-<svc>-<gen>`) with the image SHA baked into its cloud-init; deploy.yml
 * runs this controller through tasks/deploy-service.ts, which wraps it with
 * `pulumi up` create/destroy bookends. The new generation VM therefore already
 * exists; this gates it healthy and re-points traffic. Every side effect
 * (health probe, LB writes) is passed in via `plan`, so this function stays
 * pure and the unit tests can assert exact step order. See
 * infra/tasks/README.md for the lb-overlap vs exclusive strategy design.
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
    // slot; the old worker must release it first (deploy-service.ts destroys the
    // old generation and re-gates health after this returns).
    record('health-gate new generation (process up)')
    if (!(await plan.healthGate())) return { ok: false, aborted: 'unhealthy', steps }
    record('new generation ready to acquire slot')
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
  // Level-triggered reconcile: the desired final state is `[new]`, reached only
  // after the new generation is health-verified; the safe intermediate state is
  // the overlap `[old, new]`. Drive the live list toward desired with idempotent
  // SetBackendServers calls; an empty, stale, or unexpected live pool (including
  // old == new on an idempotent redeploy) is always reconciled
  // correct.
  const overlap = [...new Set([...plan.oldIps, ...plan.newIps])]
  let live = plan.getServers ? await plan.getServers() : plan.oldIps
  record(`observed LB server list: ${live.join(',') || '<empty>'}`)

  // Phase 1: ensure the overlap is attached before verifying, unless the live
  // list is already exactly the desired `[new]` (a prior run contracted it).
  if (!sameIps(live, plan.newIps)) {
    if (sameIps(live, overlap)) {
      record('LB already expanded to [old, new]')
    } else {
      record(`expand LB to [old, new] (${overlap.length} server(s)); was ${live.join(',') || '<empty>'}`)
      await setServers(overlap)
    }
    live = overlap
  }

  if (plan.healthAfterExpand) {
    record('health-gate new generation (/health == SHA)')
    if (!(await plan.healthGate())) return { ok: false, aborted: 'unhealthy', steps }
  }

  // Phase 2: contract to the new generation only (verified above). Idempotent:
  // skipped only when the live list is already exactly `[new]`.
  if (!sameIps(live, plan.newIps)) {
    record('contract LB to [new]')
    await contractBackend(setServers, plan.newIps)
    live = plan.newIps
  } else {
    record('LB already serving [new]')
  }

  record(`drain old generation for ${plan.drainSeconds}s (drainPolicy=${plan.drainPolicy ?? 'requests'})`)
  if (plan.drainSeconds > 0) await sleep(plan.drainSeconds * 1000)

  return { ok: true, steps }
}

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
  const fetchImpl = resolveFetch(opts.fetchImpl)
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

/** Extract the string entries of a value that may be an array. */
function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/** Defensive multi-shape parse of a Scaleway backend payload's server list. */
function parseBackendServers(payload: string): string[] {
  const data: unknown = JSON.parse(payload)
  if (!isRecord(data)) return []
  // The list may sit on the root or under a `backend` wrapper.
  const backend = isRecord(data.backend) ? data.backend : data
  const direct = stringArray(backend.server_ip) ?? stringArray(backend.server_ips) ?? stringArray(backend.serverIps)
  if (direct) return direct
  if (Array.isArray(backend.servers)) {
    return backend.servers
      .map((server: unknown) => {
        if (typeof server === 'string') return server
        if (!isRecord(server)) return ''
        const ip = server.ip ?? server.serverIp ?? server.server_ip
        return typeof ip === 'string' ? ip : ''
      })
      .filter(Boolean)
  }
  return []
}

export function createLbGetServers(opts: LbSetServersOptions): GetServersFn {
  const fetchImpl = resolveFetch(opts.fetchImpl)
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

// Standalone entry point: wires the live effects and runs the cutover. The
// `pulumi up` create/destroy bookends are CI-orchestrated around this call
// (see .github/workflows/deploy.yml), keeping subprocess calls out of the core.

function parseIps(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter((ip) => ip.length > 0)
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2)
  const service = getFlag(argv, '--service')
  const sha = getFlag(argv, '--sha')
  const strategy = getFlag(argv, '--strategy')
  const drainPolicyRaw = getFlag(argv, '--drain-policy') ?? 'requests'
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
  if (drainPolicyRaw !== 'requests' && drainPolicyRaw !== 'reconnect') {
    process.stderr.write(`Unknown --drain-policy '${drainPolicyRaw}' (expected requests | reconnect)\n`)
    process.exit(2)
  }
  const drainPolicy: DrainPolicy = drainPolicyRaw

  const healthGate: HealthGateFn = async () => {
    const outcome = await pollForVersion({
      url: healthUrl,
      expectedSha: sha,
      probe: createFetchProbe(8000),
    })
    return outcome.ok
  }

  // Both LB effects are built together inside the one validated block, so the
  // flags are read (and checked) exactly once.
  let setServers: SetServersFn | undefined
  let getServers: GetServersFn | undefined
  if (strategy === 'lb-overlap') {
    const zone = getFlag(argv, '--lb-zone')
    const backendId = getFlag(argv, '--backend-id')
    if (!zone || !backendId || !secretKey) {
      process.stderr.write('lb-overlap requires: --lb-zone, --backend-id, SCW_SECRET_KEY\n')
      process.exit(2)
    }
    setServers = createLbSetServers({ secretKey, zone, backendId })
    getServers = createLbGetServers({ secretKey, zone, backendId })
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
    getServers,
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
