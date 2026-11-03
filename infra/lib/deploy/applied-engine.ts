import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { conditionOn, controlPrefix, putJsonObject, readObjectText, type S3Like } from '../stack/control-store';
import { errorMessage } from '../utils/errors';
import { isRecord } from '../utils/guards';

/**
 * How a run ends when its target describes the app otherwise than the applied engine: the image an apply built from the operator's checkout,
 * with the description it applied. The run stops before anything is composed or switched, and the apply starts it again at its end.
 */
export const APPLY_NEEDED = 'apply needed';

/** The engine image's repository name in the environment's registry namespace. */
export const ENGINE_IMAGE_NAME = 'infra-engine';

/** Where the engine image keeps its stamp, written by its build (infra/Dockerfile): outside any checkout, so only an engine image has one. */
const ENGINE_STAMP_PATH = '/engine/stamp.json';

const HASH = /^[0-9a-f]{64}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

/**
 * A value as one canonical JSON text: object keys sorted, no whitespace, members that are undefined left out as `JSON.stringify` does, and a
 * function as its source with every run of whitespace made one space. Two descriptions that differ only in key order or layout give one text.
 * @throws for a value JSON has no form of (a bigint, a symbol, a number that is not finite, a class instance) and for a cycle
 */
export function canonicalJson(value: unknown): string {
  const path = new Set<object>();
  const write = (current: unknown, where: string): string | undefined => {
    if (current === undefined) return undefined;
    if (current === null || typeof current === 'boolean' || typeof current === 'string') return JSON.stringify(current);
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) throw new Error(`description: ${where} is ${current}, which JSON has no form of`);
      return JSON.stringify(current);
    }
    if (typeof current === 'function') return `{"function":${JSON.stringify(String(current).replace(/\s+/g, ' '))}}`;
    if (typeof current !== 'object') throw new Error(`description: ${where} is a ${typeof current}, which JSON has no form of`);
    if (path.has(current)) throw new Error(`description: ${where} refers back to itself`);
    path.add(current);
    try {
      if (Array.isArray(current)) return `[${current.map((item, index) => write(item, `${where}[${index}]`) ?? 'null').join(',')}]`;
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) throw new Error(`description: ${where} is no plain object`);
      const members = Object.keys(current)
        .sort()
        .flatMap((key) => {
          const text = write((current as Record<string, unknown>)[key], `${where}.${key}`);
          return text === undefined ? [] : [`${JSON.stringify(key)}:${text}`];
        });
      return `{${members.join(',')}}`;
    } finally {
      path.delete(current);
    }
  };
  return write(value, 'the description') ?? 'null';
}

/** The sha256 of a description's canonical JSON, in hex: what an apply records, the engine image carries and a builder reports. */
export function descriptionHash(description: unknown): string {
  return createHash('sha256').update(canonicalJson(description)).digest('hex');
}

/** The engine image's repository in an environment's registry namespace, as the job pulls it. */
export function engineImageRepository(region: string, namespace: string): string {
  return `rg.${region}.scw.cloud/${namespace}/${ENGINE_IMAGE_NAME}`;
}

/**
 * The engine image named by its digest, as the main job's definition names it: a tag can move to another image, a digest names one.
 * @throws for a digest that is not `sha256:<hex>`
 */
export function engineImageRef(repository: string, digest: string): string {
  if (!DIGEST.test(digest)) throw new Error(`the engine image is named by its digest (sha256:<hex>), got '${digest}'`);
  return `${repository}@${digest}`;
}

/** `control/<mode>/applied.json`: what the last apply published, written on the operator key and read by the observer. */
export interface AppliedEngine {
  /** The hash of the description the apply applied, which its engine image carries. */
  descriptionHash: string;
  /** The engine image's digest in the registry, `sha256:<hex>`. */
  imageDigest: string;
  /** The commit the operator's checkout stood at. */
  commit: string;
  appliedAt: string;
}

const appliedEngineKey = (stack: string): string => `${controlPrefix(stack)}applied.json`;

/** Parse the applied engine, refusing one whose hash, digest or commit has another form. */
function parseAppliedEngine(text: string): AppliedEngine {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`applied engine: not valid JSON (${errorMessage(error)})`);
  }
  if (!isRecord(raw)) throw new Error('applied engine: not an object');
  const { descriptionHash: hash, imageDigest, commit, appliedAt } = raw;
  if (typeof hash !== 'string' || !HASH.test(hash)) throw new Error('applied engine: descriptionHash is no sha256');
  if (typeof imageDigest !== 'string' || !DIGEST.test(imageDigest)) throw new Error('applied engine: imageDigest is no sha256 digest');
  if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) throw new Error('applied engine: commit is no commit id');
  if (typeof appliedAt !== 'string') throw new Error('applied engine: appliedAt is missing');
  return { descriptionHash: hash, imageDigest, commit, appliedAt };
}

/** Read the applied engine; undefined before the first apply that published one. */
export async function readAppliedEngine(s3: S3Like, bucket: string, stack: string): Promise<AppliedEngine | undefined> {
  const { body } = await readObjectText(s3, bucket, appliedEngineKey(stack));
  return body ? parseAppliedEngine(body) : undefined;
}

/** Write the applied engine, conditional on the version read just before: two applies at once fail one loudly. */
export async function writeAppliedEngine(s3: S3Like, bucket: string, stack: string, applied: AppliedEngine): Promise<void> {
  const { etag } = await readObjectText(s3, bucket, appliedEngineKey(stack));
  await putJsonObject(s3, bucket, appliedEngineKey(stack), `${JSON.stringify(applied, null, 2)}\n`, conditionOn(etag));
}

/** Delete the applied engine, as a teardown does with the image it names. */
export async function deleteAppliedEngine(s3: S3Like, bucket: string, stack: string): Promise<void> {
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: appliedEngineKey(stack) }));
}

/** What the engine image's build wrote for its runs: the environment it was built for and the hash of the description it carries. */
export interface EngineStamp {
  mode: string;
  descriptionHash: string;
}

/**
 * The stamp of the engine image this process runs in; undefined outside one. A start call sets values, never files, so what the stamp says
 * holds for every run of the image.
 * @throws for a stamp that does not parse: the image is broken, and no run of it may guess
 */
export function readEngineStamp(path = ENGINE_STAMP_PATH): EngineStamp | undefined {
  if (!existsSync(path)) return undefined;
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRecord(raw) || typeof raw.mode !== 'string' || typeof raw.descriptionHash !== 'string' || !HASH.test(raw.descriptionHash)) {
    throw new Error(`the engine stamp ${path} is no { mode, descriptionHash }`);
  }
  return { mode: raw.mode, descriptionHash: raw.descriptionHash };
}

/**
 * Why this run's engine may not deploy a release, starting with {@link APPLY_NEEDED}; undefined when it may. It may not when the run started
 * from no engine image, from one built for another environment, or when the release's own description, which its builder reported,
 * differs from the one the image carries or is missing, as for a commit older than the applied engine.
 */
export function applyNeeded(opts: { stamp?: EngineStamp; mode: string; sha: string; description?: string }): string | undefined {
  const release = opts.sha.slice(0, 10);
  if (!opts.stamp) return `${APPLY_NEEDED}: this run did not start from the engine image an apply publishes`;
  if (opts.stamp.mode !== opts.mode) return `${APPLY_NEEDED}: the engine image was built for ${opts.stamp.mode}, not ${opts.mode}`;
  if (!opts.description) return `${APPLY_NEEDED}: ${release} reports no description of the app, as a commit older than the applied engine`;
  if (opts.description !== opts.stamp.descriptionHash) {
    return `${APPLY_NEEDED}: ${release} describes the app otherwise than the applied engine (${opts.description.slice(0, 12)}, applied ${opts.stamp.descriptionHash.slice(0, 12)})`;
  }
  return undefined;
}
