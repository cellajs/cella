import { makeS3Client } from '../scaleway/s3-client';
import { errorMessage } from '../utils/errors';
import { isRecord } from '../utils/guards';

/**
 * The control records of an environment, under `control/<mode>/` of its boot-diagnostics bucket: the live record (lib/deploy/live-record.ts),
 * the lease, the rotations and the applied engine an apply publishes (lib/deploy/applied-engine.ts). The observer reads them all, and the
 * Pulumi program reads the applied engine alone.
 */

/** One rotation: when, and who ran it. */
export interface RotationRecord {
  at: string;
  by: string;
}

/**
 * The rotations of an environment. `counter` rises with every rotation, and the live record keeps the counter each machine was booted
 * under, so the next deploy replaces every machine and none keeps a key or a value from before. No date is a deadline: the CLI shows
 * the last of each kind.
 */
export interface Rotations {
  counter: number;
  /** The last rotation of Scaleway API keys, at an Owner moment. */
  keys?: RotationRecord;
  /** The last rotation of the secrets the engine checks: database role passwords and generated values. */
  secrets?: RotationRecord;
}

/** Minimal S3 client surface used here (the AWS SDK `S3Client` satisfies it). */
export interface S3Like {
  send(command: unknown): Promise<{ Body?: { transformToString(): Promise<string> }; ETag?: string }>;
}

/** Lazy SDK loader, keeps `@aws-sdk/client-s3` out of the Pulumi plan path. */
const s3sdk = () => import('@aws-sdk/client-s3');

/** Conditional-write options mapping to Scaleway's `If-Match`/`If-None-Match`. */
export interface ConditionalWrite {
  ifMatch?: string;
  ifNoneMatch?: string;
}

/** GET an object's text body + etag; `{}` when the object does not exist. */
export async function readObjectText(s3: S3Like, bucket: string, key: string): Promise<{ body?: string; etag?: string }> {
  const { GetObjectCommand } = await s3sdk();
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return { body: res.Body ? await res.Body.transformToString() : '', etag: res.ETag };
  } catch (err) {
    if (isNotFound(err)) return {};
    throw err;
  }
}

/** HEAD an object for its etag, without its body; null when the object does not exist. */
export async function readObjectEtag(s3: S3Like, bucket: string, key: string): Promise<string | null> {
  const { HeadObjectCommand } = await s3sdk();
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return res.ETag ?? null;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** PUT a JSON object body with optional conditional-write headers. */
export async function putJsonObject(s3: S3Like, bucket: string, key: string, body: string, opts: ConditionalWrite): Promise<{ etag?: string }> {
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

/** The write condition that keeps a read-modify-write safe: the etag read, or create-only when there was no object. */
export const conditionOn = (etag: string | undefined): ConditionalWrite => (etag ? { ifMatch: etag } : { ifNoneMatch: '*' });

/** Name + HTTP status of an S3-style error, however the SDK shaped it. */
function s3ErrorInfo(err: unknown): { name?: string; status?: number } {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return { name: e?.name, status: e?.$metadata?.httpStatusCode };
}

function isNotFound(err: unknown): boolean {
  const { name, status } = s3ErrorInfo(err);
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}

export function isPreconditionFailed(err: unknown): boolean {
  const { name, status } = s3ErrorInfo(err);
  return name === 'PreconditionFailed' || status === 412;
}

/** Bucket holding the Pulumi state. Must live in the app project: Scaleway Object Storage pins API keys to their preferred project. */
export function stateBucket(slug: string): string {
  return `${slug}-pulumi-state`;
}

/** The mode a full Pulumi stack name (`organization/infra/production`) or a bare mode names. */
const modeOf = (stack: string): string => stack.split('/').pop() ?? stack;

/** Where every environment's control records live in its boot-diagnostics bucket. */
export const CONTROL_PREFIX = 'control/';

/** The folder of an environment's control records. */
export const controlPrefix = (stack: string): string => `${CONTROL_PREFIX}${modeOf(stack)}/`;

/** The lease one deploy or operator action holds at a time. */
export const lockKey = (stack: string): string => `${controlPrefix(stack)}lock.json`;

/** The rotations an operator records. */
export const rotationsKey = (stack: string): string => `${controlPrefix(stack)}rotations.json`;

function parseRotationRecord(kind: string, value: unknown): RotationRecord {
  if (!isRecord(value) || typeof value.at !== 'string' || typeof value.by !== 'string') {
    throw new Error(`rotations: ${kind} must be { at, by } strings`);
  }
  return { at: value.at, by: value.by };
}

/** Parse the rotations object. A malformed one fails loudly: the deploy reads its counter. */
export function parseRotations(text: string): Rotations {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`rotations: not valid JSON (${errorMessage(err)})`);
  }
  if (!isRecord(raw) || typeof raw.counter !== 'number') throw new Error('rotations: counter must be a number');
  const rotations: Rotations = { counter: raw.counter };
  if (raw.keys !== undefined) rotations.keys = parseRotationRecord('keys', raw.keys);
  if (raw.secrets !== undefined) rotations.secrets = parseRotationRecord('secrets', raw.secrets);
  return rotations;
}

/** Read the rotations; `{ counter: 0 }` before the first one. */
export async function readRotations(s3: S3Like, bucket: string, stack: string): Promise<{ rotations: Rotations; etag?: string }> {
  const { body, etag } = await readObjectText(s3, bucket, rotationsKey(stack));
  return { rotations: body ? parseRotations(body) : { counter: 0 }, etag };
}

/** Record a rotation of one kind: the counter rises, so every machine a deploy keeps from before it is replaced. */
export function withRotation(rotations: Rotations, kind: 'keys' | 'secrets', record: RotationRecord): Rotations {
  return { ...rotations, counter: rotations.counter + 1, [kind]: record };
}

/**
 * Record a rotation. The caller holds the lease; the write is conditional on the object it read, so a write that raced it fails loudly and
 * nothing is lost.
 */
export async function recordRotation(opts: {
  s3: S3Like;
  bucket: string;
  stack: string;
  kind: 'keys' | 'secrets';
  by: string;
  now?: Date;
}): Promise<Rotations> {
  const { rotations, etag } = await readRotations(opts.s3, opts.bucket, opts.stack);
  const next = withRotation(rotations, opts.kind, { at: (opts.now ?? new Date()).toISOString(), by: opts.by });
  await putJsonObject(opts.s3, opts.bucket, rotationsKey(opts.stack), `${JSON.stringify(next, null, 2)}\n`, conditionOn(etag));
  return next;
}

/** Build an S3 client with an explicit key. The cast keeps the SDK behind S3Like so tests can pass a plain fake. */
export async function makeControlClient(region: string, accessKey: string, secretKey: string): Promise<S3Like> {
  return (await makeS3Client(region, accessKey, secretKey)) as unknown as S3Like;
}

/** The `pulumi login` URL of the state bucket: the S3 backend at Scaleway's regional endpoint. */
export function stateBackendUrl(bucket: string, region: string): string {
  return `s3://${bucket}?endpoint=s3.${region}.scw.cloud&region=${region}`;
}

/** Identifies the writer in `updatedBy`, and an operator action's lease: a main job run (its target) or a local operator. */
export function controlActor(): string {
  if (process.env.TARGET_SHA) return `job:${process.env.TARGET_SHA.slice(0, 10)}`;
  return `operator:${process.env.USER ?? process.env.LOGNAME ?? 'unknown'}`;
}

/** The lease owner a run holds the lease as: its id, which a scheduled run that finds the lease held names. */
export function leaseOwnerOfRun(run: string): string {
  return `run:${run}`;
}

/** The lease's operation while a run deploys, the one that makes and deletes machines; a scheduled run that only looks holds another. */
export const DEPLOY_OPERATION = 'deploy';

/** True for a lease a deploy holds: a run's, under the deploy operation. */
export function leaseDeploys(info: { owner?: string; operation?: string }): boolean {
  return Boolean(info.owner?.startsWith('run:') && info.operation === DEPLOY_OPERATION);
}

/** True while a deploy holds a live lease under this run: its record that says running is deploying, and interrupted otherwise. */
export function leaseHeldByRun(lock: { owner?: string; operation?: string; expiresAt?: string } | undefined, run: string, now = Date.now()): boolean {
  return lock?.owner === leaseOwnerOfRun(run) && lock.operation === DEPLOY_OPERATION && Date.parse(lock.expiresAt ?? '') > now;
}

/** Who holds a lease, as a person reads it: `run <id>` for a deploy, else the holder and its operation. */
export function leaseHolder(info: Pick<LockInfo, 'owner' | 'operation'>): string {
  return info.owner.startsWith('run:') ? `run ${info.owner.slice('run:'.length)}` : `${info.owner} (${info.operation})`;
}

/** Metadata for the conditional-write lock that serializes changes to an environment. */
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
  if (typeof owner !== 'string' || typeof operation !== 'string' || typeof acquiredAt !== 'string' || typeof expiresAt !== 'string') return undefined;
  return { owner, operation, acquiredAt, expiresAt };
}

async function readLock(s3: S3Like, bucket: string, key: string): Promise<{ info?: LockInfo; etag?: string }> {
  const { body, etag } = await readObjectText(s3, bucket, key);
  return { info: body ? parseLockInfo(body) : undefined, etag };
}

async function putLock(s3: S3Like, bucket: string, key: string, info: LockInfo, opts: ConditionalWrite): Promise<void> {
  await putJsonObject(s3, bucket, key, `${JSON.stringify(info, null, 2)}\n`, opts);
}

/** Read the lock object without mutating it. Undefined when no lock is held or the object is unparseable. */
export async function peekLock(s3: S3Like, bucket: string, key: string): Promise<LockInfo | undefined> {
  return (await readLock(s3, bucket, key)).info;
}

/**
 * Acquire the lock. Returns `{acquired:false, held}` when a live lock is held by someone else; breaks and takes an expired lock. With
 * `adopt`, a lock held under the same owner is taken over: a process hands its lease to the child it starts, under the child's run.
 */
export async function acquireLock(
  s3: S3Like,
  bucket: string,
  key: string,
  opts: { owner: string; operation: string; ttlMs: number; now?: number; adopt?: boolean },
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
  if (held && Date.parse(held.expiresAt) > now && !(opts.adopt && held.owner === opts.owner)) return { acquired: false, held };
  try {
    await putLock(s3, bucket, key, info, conditionOn(etag));
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

export type RenewResult = { renewed: true; info: LockInfo } | { renewed: false; held?: LockInfo };

/**
 * Extend our own lock's expiry under `If-Match`, so a live holder keeps a short lease alive and a dead one lets it lapse within one TTL.
 * A lock that is missing, owned by someone else, or replaced between read and write is reported as not renewed and never overwritten.
 */
export async function renewLock(s3: S3Like, bucket: string, key: string, owner: string, ttlMs: number, now = Date.now()): Promise<RenewResult> {
  const { info, etag } = await readLock(s3, bucket, key);
  if (!info || info.owner !== owner) return { renewed: false, held: info };
  const next: LockInfo = { ...info, expiresAt: new Date(now + ttlMs).toISOString() };
  try {
    await putLock(s3, bucket, key, next, conditionOn(etag));
    return { renewed: true, info: next };
  } catch (err) {
    if (!isPreconditionFailed(err)) throw err;
    const { info: raced } = await readLock(s3, bucket, key);
    return { renewed: false, held: raced };
  }
}

/**
 * Give our own lock to another owner and operation under `If-Match`, with a fresh expiry: false when it is no longer ours, or was replaced
 * between read and write.
 */
export async function handOverLock(
  s3: S3Like,
  bucket: string,
  key: string,
  opts: { from: string; to: string; operation: string; ttlMs: number; now?: number },
): Promise<boolean> {
  const { info, etag } = await readLock(s3, bucket, key);
  if (!info || info.owner !== opts.from) return false;
  const next: LockInfo = {
    ...info,
    owner: opts.to,
    operation: opts.operation,
    expiresAt: new Date((opts.now ?? Date.now()) + opts.ttlMs).toISOString(),
  };
  try {
    await putLock(s3, bucket, key, next, conditionOn(etag));
    return true;
  } catch (err) {
    if (isPreconditionFailed(err)) return false;
    throw err;
  }
}

/** Unconditionally remove the lock (the `infra unlock` escape hatch). */
export async function forceUnlock(s3: S3Like, bucket: string, key: string): Promise<LockInfo | undefined> {
  const { DeleteObjectCommand } = await s3sdk();
  const { info } = await readLock(s3, bucket, key);
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return info;
}
