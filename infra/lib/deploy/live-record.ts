import type { Slot } from '../machine-roles';
import {
  type ConditionalWrite,
  conditionOn,
  controlPrefix,
  isPreconditionFailed,
  putJsonObject,
  readObjectText,
  type S3Like,
} from '../stack/control-store';
import { errorMessage } from '../utils/errors';
import { isRecord } from '../utils/guards';
import { sleep as defaultSleep } from '../utils/sleep';

/**
 * What one role serves: the slot whose machine takes its traffic, that machine, the commit it runs, and the retry counter and rotation it
 * was booted under. A role that serves nothing has no entry.
 */
export interface LiveRole {
  slot: Slot;
  /** The machine's Instance id. */
  machine: string;
  commit: string;
  retry: number;
  rotation: number;
}

/** `control/<mode>/live.json`: per role what serves, written by the deploy after each switch. */
export interface LiveRecord {
  schemaVersion: 1;
  roles: Record<string, LiveRole>;
  updatedAt?: string;
  updatedBy?: string;
}

export const liveRecordKey = (stack: string): string => `${controlPrefix(stack)}live.json`;

const emptyLiveRecord = (): LiveRecord => ({ schemaVersion: 1, roles: {} });

function parseRole(role: string, value: unknown): LiveRole {
  if (!isRecord(value)) throw new Error(`live record: roles.${role} must be an object`);
  const { slot, machine, commit, retry, rotation } = value;
  if (slot !== 'a' && slot !== 'b') throw new Error(`live record: roles.${role}.slot must be 'a' or 'b'`);
  if (typeof machine !== 'string' || machine === '') throw new Error(`live record: roles.${role}.machine must be a machine id`);
  if (typeof commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(commit)) throw new Error(`live record: roles.${role}.commit must be a commit id`);
  if (typeof retry !== 'number' || typeof rotation !== 'number') throw new Error(`live record: roles.${role} must name its retry and rotation`);
  return { slot, machine, commit, retry, rotation };
}

/** Parse the live record. A malformed one fails the deploy loudly: it decides which slot a new machine takes. */
export function parseLiveRecord(text: string): LiveRecord {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`live record: not valid JSON (${errorMessage(err)})`);
  }
  if (!isRecord(raw) || raw.schemaVersion !== 1) throw new Error('live record: unsupported schemaVersion (expected 1)');
  if (!isRecord(raw.roles)) throw new Error('live record: roles must be an object');
  const record: LiveRecord = {
    schemaVersion: 1,
    roles: Object.fromEntries(Object.entries(raw.roles).map(([role, value]) => [role, parseRole(role, value)])),
  };
  if (typeof raw.updatedAt === 'string') record.updatedAt = raw.updatedAt;
  if (typeof raw.updatedBy === 'string') record.updatedBy = raw.updatedBy;
  return record;
}

/** Read the live record; the empty one, with no etag, before the first deploy. */
export async function readLiveRecord(s3: S3Like, bucket: string, stack: string): Promise<{ record: LiveRecord; etag?: string }> {
  const { body, etag } = await readObjectText(s3, bucket, liveRecordKey(stack));
  return { record: body ? parseLiveRecord(body) : emptyLiveRecord(), etag };
}

/** Delete the live record, as a teardown does with the machines it names. */
export async function deleteLiveRecord(s3: S3Like, bucket: string, stack: string): Promise<void> {
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: liveRecordKey(stack) }));
}

/** Write the live record under a condition: the etag it was read with, or create-only. */
async function writeLiveRecord(s3: S3Like, bucket: string, stack: string, record: LiveRecord, opts: ConditionalWrite): Promise<void> {
  await putJsonObject(s3, bucket, liveRecordKey(stack), `${JSON.stringify(record, null, 2)}\n`, opts);
}

/**
 * Set or clear one role's entry, read-modify-write under `If-Match`, and again after a jittered pause on a conflict: each writer writes only
 * its own entry over the winner's record. The deploy writes one entry at a time (tasks/switch-machines.ts), so a conflict is another process.
 */
export async function recordRole(
  s3: S3Like,
  bucket: string,
  stack: string,
  role: string,
  entry: LiveRole | undefined,
  opts: { by: string; attempts?: number; now?: () => Date; sleep?: (ms: number) => Promise<void> } = { by: 'unknown' },
): Promise<void> {
  const attempts = opts.attempts ?? 8;
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 1; ; attempt++) {
    const { record, etag } = await readLiveRecord(s3, bucket, stack);
    const roles = { ...record.roles };
    if (entry) roles[role] = entry;
    else delete roles[role];
    const next: LiveRecord = { schemaVersion: 1, roles, updatedAt: (opts.now?.() ?? new Date()).toISOString(), updatedBy: opts.by };
    try {
      await writeLiveRecord(s3, bucket, stack, next, conditionOn(etag));
      return;
    } catch (err) {
      if (!isPreconditionFailed(err) || attempt >= attempts) throw err;
      await sleep(200 * attempt + Math.floor(Math.random() * 300));
    }
  }
}

/** What a deploy of a commit is: the target, the retry counter of its environments line, and the rotation counter of the environment. */
export interface DeployTarget {
  commit: string;
  retry: number;
  rotation: number;
}

/** Whether a role already serves the target: the same commit, booted under the same retry counter and rotation. */
function servesTarget(entry: LiveRole | undefined, target: DeployTarget): boolean {
  return entry !== undefined && entry.commit === target.commit && entry.retry === target.retry && entry.rotation === target.rotation;
}

/**
 * The roles a deploy replaces: every one that does not serve the target. None means the deploy is `unchanged`: running the same deploy
 * twice changes nothing, while a raised retry counter or a rotation since replaces every machine.
 */
export function rolesToReplace(record: LiveRecord, roles: readonly string[], target: DeployTarget): string[] {
  return roles.filter((role) => !servesTarget(record.roles[role], target));
}
