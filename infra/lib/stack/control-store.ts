import { scwS3Endpoint } from '../scaleway/scw-fetch';
import { errorMessage } from '../utils/errors';
import { isRecord } from '../utils/guards';

/** A provisioned, content-addressed generation: VM resource `vm-<svc>-<id>`, baked with `sha`, promoted at monotonic `seq`. */
export interface GenRef {
  /** Content-addressed generation id, authoritative resource suffix. Stored because the live VM exists under this id; never re-derived. @see lib/gen-id.ts */
  id: string;
  /** Image SHA baked into this generation. */
  sha: string;
  /** Monotonic sequence stamped when this generation was promoted to active. */
  seq: number;
}

/** Per-service rollout pointers in the S3 control object: `active` takes live traffic, `pendingSha` holds deploy intent until Pulumi derives the generation id, `seq` orders promotion and garbage collection. */
export interface ServiceRollout {
  active?: GenRef;
  pendingSha?: string;
  seq: number;
}

export interface BootstrapState {
  /** ISO timestamp stamped once the CI deploy key is minted. */
  completedAt?: string;
  /** ISO timestamp set while a fresh provision defers compute; cleared after. */
  computeDeferredSince?: string;
}

export interface ControlState {
  schemaVersion: 2;
  bootstrap: BootstrapState;
  /** Keyed by service slug. */
  rollout: Record<string, ServiceRollout>;
  /** ISO timestamp of the last write. */
  updatedAt?: string;
  /** Who wrote it last, e.g. `ci:run-512` or `operator:flip@host`. */
  updatedBy?: string;
}

/** Minimal S3 client surface used here (the AWS SDK `S3Client` satisfies it). */
export interface S3Like {
  send(command: unknown): Promise<{ Body?: { transformToString(): Promise<string> }; ETag?: string }>;
}

/** Lazy SDK loader, keeps `@aws-sdk/client-s3` out of the Pulumi plan path. */
const s3sdk = () => import('@aws-sdk/client-s3');

/** Conditional-write options mapping to Scaleway's `If-Match`/`If-None-Match`. */
interface ConditionalWrite {
  ifMatch?: string;
  ifNoneMatch?: string;
}

/** GET an object's text body + etag; `{}` when the object does not exist. */
async function getObjectText(s3: S3Like, bucket: string, key: string): Promise<{ body?: string; etag?: string }> {
  const { GetObjectCommand } = await s3sdk();
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return { body: res.Body ? await res.Body.transformToString() : '', etag: res.ETag };
  } catch (err) {
    if (isNotFound(err)) return {};
    throw err;
  }
}

/** PUT a JSON object body with optional conditional-write headers. */
async function putJsonObject(
  s3: S3Like,
  bucket: string,
  key: string,
  body: string,
  opts: ConditionalWrite,
): Promise<{ etag?: string }> {
  const { PutObjectCommand } = await s3sdk();
  const res = await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
      ...(opts.ifMatch ? { IfMatch: opts.ifMatch } : {}),
      ...(opts.ifNoneMatch ? { IfNoneMatch: opts.ifNoneMatch } : {}),
    }),
  );
  return { etag: res.ETag };
}

/** Name + HTTP status of an S3-style error, however the SDK shaped it. */
function s3ErrorInfo(err: unknown): { name?: string; status?: number } {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return { name: e?.name, status: e?.$metadata?.httpStatusCode };
}

function isNotFound(err: unknown): boolean {
  const { name, status } = s3ErrorInfo(err);
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}

function isPreconditionFailed(err: unknown): boolean {
  const { name, status } = s3ErrorInfo(err);
  return name === 'PreconditionFailed' || status === 412;
}

export function emptyControlState(): ControlState {
  return { schemaVersion: 2, bootstrap: {}, rollout: {} };
}

/** Bucket holding the Pulumi state and the control object. Must live in the app project: Scaleway Object Storage pins API keys to their preferred project, so a bucket elsewhere is unreachable for the project-scoped CI key. */
export function stateBucket(slug: string): string {
  return `${slug}-pulumi-state`;
}

/** Control object key for a stack. Accepts a full Pulumi stack name (`organization/infra/production`) or a bare mode (`production`). */
export function controlKey(stack: string): string {
  const short = stack.split('/').pop() ?? stack;
  return `control/${short}.json`;
}

/** Lock object key for a stack (sibling of the control object). */
export function lockKey(stack: string): string {
  const short = stack.split('/').pop() ?? stack;
  return `control/${short}.lock.json`;
}

function parseGenRef(slug: string, field: string, value: unknown): GenRef {
  if (!isRecord(value)) throw new Error(`control: rollout['${slug}'].${field} must be an object`);
  const { id, sha, seq } = value;
  if (typeof id !== 'string') throw new Error(`control: rollout['${slug}'].${field}.id must be a string`);
  if (typeof sha !== 'string') throw new Error(`control: rollout['${slug}'].${field}.sha must be a string`);
  if (typeof seq !== 'number') throw new Error(`control: rollout['${slug}'].${field}.seq must be a number`);
  return { id, sha, seq };
}

function parseServiceRollout(slug: string, value: unknown): ServiceRollout {
  if (!isRecord(value)) throw new Error(`control: rollout['${slug}'] must be an object`);
  const { active, pendingSha, seq } = value;
  if (typeof seq !== 'number') throw new Error(`control: rollout['${slug}'].seq must be a number`);
  if (pendingSha !== undefined && typeof pendingSha !== 'string')
    throw new Error(`control: rollout['${slug}'].pendingSha must be a string`);
  const out: ServiceRollout = { seq };
  if (active !== undefined) out.active = parseGenRef(slug, 'active', active);
  if (pendingSha !== undefined) out.pendingSha = pendingSha;
  return out;
}

/** Parse and validate the control JSON. A malformed document fails the deploy loudly. */
export function parseControlState(text: string): ControlState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`control: not valid JSON (${errorMessage(err)})`);
  }
  if (!isRecord(raw)) throw new Error('control: root must be an object');
  if (raw.schemaVersion !== 2)
    throw new Error(`control: unsupported schemaVersion ${String(raw.schemaVersion)} (expected 2)`);

  const bootstrap: BootstrapState = {};
  if (raw.bootstrap !== undefined) {
    if (!isRecord(raw.bootstrap)) throw new Error('control: bootstrap must be an object');
    if (raw.bootstrap.completedAt !== undefined) {
      if (typeof raw.bootstrap.completedAt !== 'string')
        throw new Error('control: bootstrap.completedAt must be a string');
      bootstrap.completedAt = raw.bootstrap.completedAt;
    }
    if (raw.bootstrap.computeDeferredSince !== undefined) {
      if (typeof raw.bootstrap.computeDeferredSince !== 'string')
        throw new Error('control: bootstrap.computeDeferredSince must be a string');
      bootstrap.computeDeferredSince = raw.bootstrap.computeDeferredSince;
    }
  }

  const rollout: Record<string, ServiceRollout> = {};
  if (raw.rollout !== undefined) {
    if (!isRecord(raw.rollout)) throw new Error('control: rollout must be an object');
    for (const [slug, value] of Object.entries(raw.rollout)) rollout[slug] = parseServiceRollout(slug, value);
  }

  const state: ControlState = { schemaVersion: 2, bootstrap, rollout };
  if (typeof raw.updatedAt === 'string') state.updatedAt = raw.updatedAt;
  if (typeof raw.updatedBy === 'string') state.updatedBy = raw.updatedBy;
  return state;
}

export function serializeControlState(state: ControlState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

// Pure rollout-state transitions: every state change is a total function over the previous rollout, so the orchestrator never hand-mutates pointer fields.

/** A service with no recorded rollout yet. */
export function emptyRollout(): ServiceRollout {
  return { seq: 0 };
}

/** Record the deploy intent to roll `sha` in. Idempotent, and pointers stay untouched until promotion. */
export function setPending(current: ServiceRollout | undefined, sha: string): ServiceRollout {
  const base = current ?? emptyRollout();
  return { ...base, pendingSha: sha };
}

/** Promote a resolved generation to active: `seq` advances, pending intent clears, and the old active is dropped (its VM is reaped once the new one is healthy). */
export function promote(current: ServiceRollout | undefined, resolved: { id: string; sha: string }): ServiceRollout {
  const base = current ?? emptyRollout();
  const seq = base.seq + 1;
  return { seq, active: { id: resolved.id, sha: resolved.sha, seq } };
}

/** Read the control object. Returns the empty state and no etag when the object does not exist yet. */
export async function readControlState(
  s3: S3Like,
  bucket: string,
  key: string,
): Promise<{ state: ControlState; etag?: string }> {
  const { body, etag } = await getObjectText(s3, bucket, key);
  return { state: body ? parseControlState(body) : emptyControlState(), etag };
}

/** Write the control object. `ifMatch`/`ifNoneMatch` map to Scaleway's conditional-write headers; pass `ifNoneMatch: '*'` for atomic create-if-absent. */
export async function writeControlState(
  s3: S3Like,
  bucket: string,
  key: string,
  state: ControlState,
  opts: ConditionalWrite = {},
): Promise<{ etag?: string }> {
  return putJsonObject(s3, bucket, key, serializeControlState(state), opts);
}

// Orchestrator helpers: read process.env and build a client, so not part of the pure core above.

/** Build an S3 client for the state bucket with explicit credentials. */
export async function makeControlClient(region: string, accessKey: string, secretKey: string): Promise<S3Like> {
  const { S3Client } = await s3sdk();
  // The cast keeps the SDK behind S3Like so tests can pass a plain fake.
  return new S3Client({
    region,
    endpoint: scwS3Endpoint(region),
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: false,
  }) as unknown as S3Like;
}

/** Identifies the writer in `updatedBy`: CI run or local operator. */
export function controlActor(): string {
  if (process.env.GITHUB_RUN_NUMBER) return `ci:run-${process.env.GITHUB_RUN_NUMBER}`;
  return `operator:${process.env.USER ?? process.env.LOGNAME ?? 'unknown'}`;
}

/** Everything a task needs to address a stack's control + lock objects. */
export interface ControlContext {
  s3: S3Like;
  bucket: string;
  /** Key of the control object for the stack. */
  controlKey: string;
  /** Key of the lock object for the stack. */
  lockKey: string;
}

/**
 * Resolve a stack's control-object context from the environment: sets APP_MODE from the stack's short name, builds the S3 client, derives bucket and keys. Returns null when no credentials are present.
 * AWS_* credentials take precedence: the state bucket's deny-by-default policy admits the state-backend identity, which the SCW provider key need not carry.
 */
export async function controlContextForStack(
  stack: string,
  log: (msg: string) => void = console.warn,
): Promise<ControlContext | null> {
  const fromAws = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  const accessKey = fromAws ? process.env.AWS_ACCESS_KEY_ID : process.env.SCW_ACCESS_KEY;
  const secretKey = fromAws ? process.env.AWS_SECRET_ACCESS_KEY : process.env.SCW_SECRET_KEY;
  if (!accessKey || !secretKey) {
    log('control-store: no S3 credentials (SCW_* or AWS_*); cannot read/write rollout state');
    return null;
  }
  process.env.APP_MODE ??= stack.split('/').pop();
  const { loadEngineConfig } = await import('../../config/engine-config');
  const appConfig = await loadEngineConfig();
  const s3 = await makeControlClient(appConfig.s3.region, accessKey, secretKey);
  return { s3, bucket: stateBucket(appConfig.slug), controlKey: controlKey(stack), lockKey: lockKey(stack) };
}

/** Read-modify-write one service's rollout entry under `If-Match` optimistic concurrency, retrying the whole read-patch-write on conflict. Entries are per-service, so re-applying the patch over the winner's state is safe. */
export async function updateServiceRollout(
  s3: S3Like,
  bucket: string,
  key: string,
  slug: string,
  patch: (current: ServiceRollout | undefined) => ServiceRollout,
  attempts = 4,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const { state, etag } = await readControlState(s3, bucket, key);
    state.rollout[slug] = patch(state.rollout[slug]);
    state.updatedAt = new Date().toISOString();
    state.updatedBy = controlActor();
    try {
      await writeControlState(s3, bucket, key, state, etag ? { ifMatch: etag } : { ifNoneMatch: '*' });
      return;
    } catch (err) {
      if (attempt >= attempts) throw err;
    }
  }
}

/** Metadata for the conditional-write lock that serializes stack mutations. */
export interface LockInfo {
  owner: string;
  operation: string;
  acquiredAt: string;
  expiresAt: string;
}

export type AcquireResult = { acquired: true; info: LockInfo } | { acquired: false; held: LockInfo };

function parseLockInfo(text: string): LockInfo | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(raw)) return undefined;
  const { owner, operation, acquiredAt, expiresAt } = raw;
  if (
    typeof owner !== 'string' ||
    typeof operation !== 'string' ||
    typeof acquiredAt !== 'string' ||
    typeof expiresAt !== 'string'
  )
    return undefined;
  return { owner, operation, acquiredAt, expiresAt };
}

async function readLock(s3: S3Like, bucket: string, key: string): Promise<{ info?: LockInfo; etag?: string }> {
  const { body, etag } = await getObjectText(s3, bucket, key);
  return { info: body ? parseLockInfo(body) : undefined, etag };
}

async function putLock(s3: S3Like, bucket: string, key: string, info: LockInfo, opts: ConditionalWrite): Promise<void> {
  await putJsonObject(s3, bucket, key, `${JSON.stringify(info, null, 2)}\n`, opts);
}

/** Read the lock object without mutating it. Undefined when no lock is held or the object is unparseable. */
export async function peekLock(s3: S3Like, bucket: string, key: string): Promise<LockInfo | undefined> {
  return (await readLock(s3, bucket, key)).info;
}

/** Acquire the stack lock. Returns `{acquired:false, held}` when a live lock is held by someone else; breaks and takes an expired lock. */
export async function acquireLock(
  s3: S3Like,
  bucket: string,
  key: string,
  opts: { owner: string; operation: string; ttlMs: number; now?: number },
): Promise<AcquireResult> {
  const now = opts.now ?? Date.now();
  const info: LockInfo = {
    owner: opts.owner,
    operation: opts.operation,
    acquiredAt: new Date(now).toISOString(),
    expiresAt: new Date(now + opts.ttlMs).toISOString(),
  };
  try {
    await putLock(s3, bucket, key, info, { ifNoneMatch: '*' });
    return { acquired: true, info };
  } catch (err) {
    if (!isPreconditionFailed(err)) throw err;
  }
  // A lock object exists; break it only if it has expired.
  const { info: held, etag } = await readLock(s3, bucket, key);
  if (held && Date.parse(held.expiresAt) > now) return { acquired: false, held };
  try {
    await putLock(s3, bucket, key, info, etag ? { ifMatch: etag } : { ifNoneMatch: '*' });
    return { acquired: true, info };
  } catch (err) {
    if (!isPreconditionFailed(err)) throw err;
    const { info: raced } = await readLock(s3, bucket, key);
    return { acquired: false, held: raced ?? held ?? info };
  }
}

/** Release the lock only when we still own it, so a lock broken and re-taken by someone else is left alone. */
export async function releaseLock(s3: S3Like, bucket: string, key: string, owner: string): Promise<void> {
  const { DeleteObjectCommand } = await s3sdk();
  const { info } = await readLock(s3, bucket, key);
  if (!info || info.owner !== owner) return;
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Unconditionally remove the lock (the `infra unlock` escape hatch). */
export async function forceUnlock(s3: S3Like, bucket: string, key: string): Promise<LockInfo | undefined> {
  const { DeleteObjectCommand } = await s3sdk();
  const { info } = await readLock(s3, bucket, key);
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return info;
}
