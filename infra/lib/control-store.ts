/**
 * Stack control object — the single source of truth for mutable rollout state
 * (per-service generation + image SHA) and bootstrap state, stored as one JSON
 * object in the Pulumi state bucket rather than in committed `Pulumi.<stack>.yaml`
 * config. See info memory `cella-infra-rollout-state-plan`.
 *
 * Layout: `s3://<slug>-pulumi-state/control/<stack>.json` (plaintext — none of
 * this is secret). The Pulumi program reads it at plan time so a bare `pulumi up`
 * converges to live truth; the deploy orchestrator writes it around a cutover.
 *
 * Scaleway Object Storage supports conditional writes (`If-Match`/`If-None-Match`),
 * so the optional `ifMatch`/`ifNoneMatch` give optimistic concurrency and the
 * atomic create-if-absent used by the lock.
 *
 * The pure parse/serialize/merge helpers carry no S3 dependency and are unit
 * tested directly; the I/O functions take an injected client (`.send`) so they
 * can be exercised with a mock, mirroring `ensure-state-bucket.ts`.
 */
import { isRecord } from './guards'
import { scwS3Endpoint } from './scw-fetch'
import { errorMessage } from './errors'

/** A materialized, content-addressed generation: the VM resource is
 *  `vm-<svc>-<id>`, baked with `sha`, promoted at monotonic `seq`. */
export interface GenRef {
  /** Content-addressed generation id (see lib/gen-id.ts). Authoritative resource
   *  suffix — the live VM exists under THIS id, so it is stored, not re-derived. */
  id: string
  /** Image SHA baked into this generation. */
  sha: string
  /** Monotonic sequence stamped when this generation was promoted to active. */
  seq: number
}

/**
 * Per-service rollout ledger. The pointers (not a single mutable gen number) are
 * the source of truth so a partial deploy is always recoverable by recomputing
 * desired-vs-live rather than replaying a transition:
 *   - `active`   — the generation currently serving live on the LB.
 *   - `pendingSha` — a deploy INTENT: the SHA being rolled in. The genId is
 *                  derived and materialized by the Pulumi program (the genId
 *                  authority), then read back by the orchestrator — so the
 *                  ledger never has to predict an id the program owns.
 *   - `seq`      — monotonic counter, bumped on each promotion (ordering + GC).
 * No `previous` is kept: the old generation is reaped once the new one is
 * healthy, and rollback is a revert commit + forward redeploy (recreates every
 * service, including cdc, from its content-addressed id).
 */
export interface ServiceRollout {
  active?: GenRef
  pendingSha?: string
  seq: number
}

export interface BootstrapState {
  /** ISO timestamp stamped once the CI deploy key is minted. */
  completedAt?: string
  /** ISO timestamp set while a fresh provision defers compute; cleared after. */
  computeDeferredSince?: string
}

export interface ControlState {
  schemaVersion: 2
  bootstrap: BootstrapState
  /** Keyed by service slug. */
  rollout: Record<string, ServiceRollout>
  /** ISO timestamp of the last write. */
  updatedAt?: string
  /** Who wrote it last, e.g. `ci:run-512` or `operator:flip@host`. */
  updatedBy?: string
}

/** Minimal S3 client surface used here (the AWS SDK `S3Client` satisfies it). */
export interface S3Like {
  send(command: unknown): Promise<{ Body?: { transformToString(): Promise<string> }; ETag?: string }>
}

/** Lazy SDK loader — keeps `@aws-sdk/client-s3` out of the Pulumi plan path. */
const s3sdk = () => import('@aws-sdk/client-s3')

/** Conditional-write options mapping to Scaleway's `If-Match`/`If-None-Match`. */
interface ConditionalWrite {
  ifMatch?: string
  ifNoneMatch?: string
}

/** GET an object's text body + etag; `{}` when the object does not exist. */
async function getObjectText(s3: S3Like, bucket: string, key: string): Promise<{ body?: string; etag?: string }> {
  const { GetObjectCommand } = await s3sdk()
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    return { body: res.Body ? await res.Body.transformToString() : '', etag: res.ETag }
  } catch (err) {
    if (isNotFound(err)) return {}
    throw err
  }
}

/** PUT a JSON object body with optional conditional-write headers. */
async function putJsonObject(s3: S3Like, bucket: string, key: string, body: string, opts: ConditionalWrite): Promise<{ etag?: string }> {
  const { PutObjectCommand } = await s3sdk()
  const res = await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
      ...(opts.ifMatch ? { IfMatch: opts.ifMatch } : {}),
      ...(opts.ifNoneMatch ? { IfNoneMatch: opts.ifNoneMatch } : {}),
    }),
  )
  return { etag: res.ETag }
}

/** Name + HTTP status of an S3-style error, however the SDK shaped it. */
function s3ErrorInfo(err: unknown): { name?: string; status?: number } {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
  return { name: e?.name, status: e?.$metadata?.httpStatusCode }
}

function isNotFound(err: unknown): boolean {
  const { name, status } = s3ErrorInfo(err)
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404
}

function isPreconditionFailed(err: unknown): boolean {
  const { name, status } = s3ErrorInfo(err)
  return name === 'PreconditionFailed' || status === 412
}

export function emptyControlState(): ControlState {
  return { schemaVersion: 2, bootstrap: {}, rollout: {} }
}

/** Bucket holding both the Pulumi state and the control object. */
export function stateBucket(slug: string): string {
  return `${slug}-pulumi-state`
}

/** Control object key for a stack. Accepts a full Pulumi stack name
 *  (`organization/infra/production`) or a bare mode (`production`). */
export function controlKey(stack: string): string {
  const short = stack.split('/').pop() ?? stack
  return `control/${short}.json`
}

/** Lock object key for a stack (sibling of the control object). */
export function lockKey(stack: string): string {
  const short = stack.split('/').pop() ?? stack
  return `control/${short}.lock.json`
}

function parseGenRef(slug: string, field: string, value: unknown): GenRef {
  if (!isRecord(value)) throw new Error(`control: rollout['${slug}'].${field} must be an object`)
  const { id, sha, seq } = value
  if (typeof id !== 'string') throw new Error(`control: rollout['${slug}'].${field}.id must be a string`)
  if (typeof sha !== 'string') throw new Error(`control: rollout['${slug}'].${field}.sha must be a string`)
  if (typeof seq !== 'number') throw new Error(`control: rollout['${slug}'].${field}.seq must be a number`)
  return { id, sha, seq }
}

function parseServiceRollout(slug: string, value: unknown): ServiceRollout {
  if (!isRecord(value)) throw new Error(`control: rollout['${slug}'] must be an object`)
  const { active, pendingSha, seq } = value
  if (typeof seq !== 'number') throw new Error(`control: rollout['${slug}'].seq must be a number`)
  if (pendingSha !== undefined && typeof pendingSha !== 'string') throw new Error(`control: rollout['${slug}'].pendingSha must be a string`)
  const out: ServiceRollout = { seq }
  if (active !== undefined) out.active = parseGenRef(slug, 'active', active)
  if (pendingSha !== undefined) out.pendingSha = pendingSha
  return out
}

/** Parse + validate the control JSON. Throws on a malformed document rather than
 *  silently defaulting, so a corrupt object fails the deploy loudly. */
export function parseControlState(text: string): ControlState {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    throw new Error(`control: not valid JSON (${errorMessage(err)})`)
  }
  if (!isRecord(raw)) throw new Error('control: root must be an object')
  if (raw.schemaVersion !== 2) throw new Error(`control: unsupported schemaVersion ${String(raw.schemaVersion)} (expected 2)`)

  const bootstrap: BootstrapState = {}
  if (raw.bootstrap !== undefined) {
    if (!isRecord(raw.bootstrap)) throw new Error('control: bootstrap must be an object')
    if (raw.bootstrap.completedAt !== undefined) {
      if (typeof raw.bootstrap.completedAt !== 'string') throw new Error('control: bootstrap.completedAt must be a string')
      bootstrap.completedAt = raw.bootstrap.completedAt
    }
    if (raw.bootstrap.computeDeferredSince !== undefined) {
      if (typeof raw.bootstrap.computeDeferredSince !== 'string') throw new Error('control: bootstrap.computeDeferredSince must be a string')
      bootstrap.computeDeferredSince = raw.bootstrap.computeDeferredSince
    }
  }

  const rollout: Record<string, ServiceRollout> = {}
  if (raw.rollout !== undefined) {
    if (!isRecord(raw.rollout)) throw new Error('control: rollout must be an object')
    for (const [slug, value] of Object.entries(raw.rollout)) rollout[slug] = parseServiceRollout(slug, value)
  }

  const state: ControlState = { schemaVersion: 2, bootstrap, rollout }
  if (typeof raw.updatedAt === 'string') state.updatedAt = raw.updatedAt
  if (typeof raw.updatedBy === 'string') state.updatedBy = raw.updatedBy
  return state
}

export function serializeControlState(state: ControlState): string {
  return `${JSON.stringify(state, null, 2)}\n`
}

// ---------------------------------------------------------------------------
// Pure ledger transitions — every rollout state change is a total function over
// the previous rollout, so the orchestrator never hand-mutates pointer fields
// and the transitions are unit-tested in isolation.
// ---------------------------------------------------------------------------

/** A service with no rollout history yet. */
export function emptyRollout(): ServiceRollout {
  return { seq: 0 }
}

/** Record the deploy INTENT to roll `sha` in. Idempotent: re-recording the same
 *  pending sha is a no-op. Pointers are untouched until promotion. */
export function setPending(current: ServiceRollout | undefined, sha: string): ServiceRollout {
  const base = current ?? emptyRollout()
  return { ...base, pendingSha: sha }
}

/** Promote a resolved generation to active: `seq` advances and the pending
 *  intent is cleared. The old active is not retained — its VM is reaped once the
 *  new one is healthy, so rollback is a revert commit + redeploy. */
export function promote(current: ServiceRollout | undefined, resolved: { id: string; sha: string }): ServiceRollout {
  const base = current ?? emptyRollout()
  const seq = base.seq + 1
  return { seq, active: { id: resolved.id, sha: resolved.sha, seq } }
}

/** Read the control object. Returns the empty state (and no etag) when the
 *  object does not exist yet — the caller decides whether that is acceptable. */
export async function readControlState(s3: S3Like, bucket: string, key: string): Promise<{ state: ControlState; etag?: string }> {
  const { body, etag } = await getObjectText(s3, bucket, key)
  return { state: body ? parseControlState(body) : emptyControlState(), etag }
}

/** Write the control object. `ifMatch`/`ifNoneMatch` map to the conditional-write
 *  headers Scaleway supports; pass `ifNoneMatch: '*'` for atomic create-if-absent. */
export async function writeControlState(
  s3: S3Like,
  bucket: string,
  key: string,
  state: ControlState,
  opts: ConditionalWrite = {},
): Promise<{ etag?: string }> {
  return putJsonObject(s3, bucket, key, serializeControlState(state), opts)
}

// ---------------------------------------------------------------------------
// Orchestrator helpers (used by the deploy tasks; read process.env / build a
// client, so not part of the pure unit-tested core above).
// ---------------------------------------------------------------------------

/** Build an S3 client for the state bucket with explicit credentials. */
export async function makeControlClient(region: string, accessKey: string, secretKey: string): Promise<S3Like> {
  const { S3Client } = await s3sdk()
  // The cast keeps the SDK behind the minimal structural port above, so tests
  // can satisfy S3Like with a plain fake instead of the real client.
  return new S3Client({
    region,
    endpoint: scwS3Endpoint(region),
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: false,
  }) as unknown as S3Like
}

/** Identifies the writer in `updatedBy`: CI run or local operator. */
export function controlActor(): string {
  if (process.env.GITHUB_RUN_NUMBER) return `ci:run-${process.env.GITHUB_RUN_NUMBER}`
  return `operator:${process.env.USER ?? process.env.LOGNAME ?? 'unknown'}`
}

/** Everything a task needs to address a stack's control + lock objects. */
export interface ControlContext {
  s3: S3Like
  bucket: string
  /** Key of the control object for the stack. */
  controlKey: string
  /** Key of the lock object for the stack. */
  lockKey: string
}

/**
 * Resolve the control-object context for a fully-qualified stack from the
 * environment: sets APP_MODE from the stack's short name (so `shared`'s
 * appConfig resolves the right mode), builds the S3 client from SCW_* (or
 * AWS_*) credentials, and derives bucket + keys. Returns null (with a warning)
 * when no credentials are present — the caller then skips control-store writes.
 */
export async function controlContextForStack(stack: string, log: (msg: string) => void = console.warn): Promise<ControlContext | null> {
  const accessKey = process.env.SCW_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID
  const secretKey = process.env.SCW_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY
  if (!accessKey || !secretKey) {
    log('control-store: no S3 credentials (SCW_* or AWS_*); cannot read/write rollout state')
    return null
  }
  process.env.APP_MODE ??= stack.split('/').pop()
  const { appConfig } = await import('shared')
  const s3 = await makeControlClient(appConfig.s3.region, accessKey, secretKey)
  return { s3, bucket: stateBucket(appConfig.slug), controlKey: controlKey(stack), lockKey: lockKey(stack) }
}

/** Read-modify-write a single service's rollout entry. Uses `If-Match` when the
 *  object already exists (optimistic concurrency — Scaleway supports it) so a
 *  racing writer is rejected rather than silently clobbered. */
export async function updateServiceRollout(
  s3: S3Like,
  bucket: string,
  key: string,
  slug: string,
  patch: (current: ServiceRollout | undefined) => ServiceRollout,
): Promise<void> {
  const { state, etag } = await readControlState(s3, bucket, key)
  state.rollout[slug] = patch(state.rollout[slug])
  state.updatedAt = new Date().toISOString()
  state.updatedBy = controlActor()
  await writeControlState(s3, bucket, key, state, etag ? { ifMatch: etag } : {})
}

// ---------------------------------------------------------------------------
// Distributed lock — prevents concurrent mutating ops (two operators, or an
// operator and CI) from racing on the same stack. Built on Scaleway's
// conditional writes: atomic create-if-absent via `If-None-Match: *`, stale
// break via `If-Match: <etag>`.
// ---------------------------------------------------------------------------

export interface LockInfo {
  owner: string
  operation: string
  acquiredAt: string
  expiresAt: string
}

export type AcquireResult = { acquired: true; info: LockInfo } | { acquired: false; held: LockInfo }

function parseLockInfo(text: string): LockInfo | undefined {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!isRecord(raw)) return undefined
  const { owner, operation, acquiredAt, expiresAt } = raw
  if (typeof owner !== 'string' || typeof operation !== 'string' || typeof acquiredAt !== 'string' || typeof expiresAt !== 'string') return undefined
  return { owner, operation, acquiredAt, expiresAt }
}

async function readLock(s3: S3Like, bucket: string, key: string): Promise<{ info?: LockInfo; etag?: string }> {
  const { body, etag } = await getObjectText(s3, bucket, key)
  return { info: body ? parseLockInfo(body) : undefined, etag }
}

async function putLock(s3: S3Like, bucket: string, key: string, info: LockInfo, opts: ConditionalWrite): Promise<void> {
  await putJsonObject(s3, bucket, key, `${JSON.stringify(info, null, 2)}\n`, opts)
}

/** Acquire the stack lock. Returns `{acquired:false, held}` when a live lock is
 *  held by someone else; breaks and takes an expired lock. */
export async function acquireLock(
  s3: S3Like,
  bucket: string,
  key: string,
  opts: { owner: string; operation: string; ttlMs: number; now?: number },
): Promise<AcquireResult> {
  const now = opts.now ?? Date.now()
  const info: LockInfo = {
    owner: opts.owner,
    operation: opts.operation,
    acquiredAt: new Date(now).toISOString(),
    expiresAt: new Date(now + opts.ttlMs).toISOString(),
  }
  try {
    await putLock(s3, bucket, key, info, { ifNoneMatch: '*' })
    return { acquired: true, info }
  } catch (err) {
    if (!isPreconditionFailed(err)) throw err
  }
  // A lock object exists — break it only if it has expired.
  const { info: held, etag } = await readLock(s3, bucket, key)
  if (held && Date.parse(held.expiresAt) > now) return { acquired: false, held }
  try {
    await putLock(s3, bucket, key, info, etag ? { ifMatch: etag } : { ifNoneMatch: '*' })
    return { acquired: true, info }
  } catch (err) {
    if (!isPreconditionFailed(err)) throw err
    const { info: raced } = await readLock(s3, bucket, key)
    return { acquired: false, held: raced ?? held ?? info }
  }
}

/** Release the lock only if we still own it (avoids deleting a lock that was
 *  broken and re-taken by someone else). */
export async function releaseLock(s3: S3Like, bucket: string, key: string, owner: string): Promise<void> {
  const { DeleteObjectCommand } = await s3sdk()
  const { info } = await readLock(s3, bucket, key)
  if (!info || info.owner !== owner) return
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

/** Unconditionally remove the lock (the `infra unlock` escape hatch). */
export async function forceUnlock(s3: S3Like, bucket: string, key: string): Promise<LockInfo | undefined> {
  const { DeleteObjectCommand } = await s3sdk()
  const { info } = await readLock(s3, bucket, key)
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  return info
}
