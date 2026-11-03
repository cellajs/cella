import { readFileSync } from 'node:fs';
import type { MachineEnv } from '../../tasks/compose-env';
import { isRecord } from '../utils/guards';
import { type ReleaseManifest, releaseArchiveKey } from './release-archives';

/** How long a machine's links to its env file and archives last: the machine fetches them within minutes of its creation. */
export const MACHINE_FETCH_LINK_SECONDS = 15 * 60;

/** How long a machine's boot account link lasts: through a boot that fails at the end of the deploy's health gate. */
export const BOOT_ACCOUNT_LINK_SECONDS = 30 * 60;

/**
 * What the deploy hands the Pulumi program for the machines of one release, through `INFRA_RELEASE_PLAN_FILE`: the objects each new machine
 * fetches and writes, with the archives' digests, and no link: the program signs each machine's links with the deploy key as it makes the
 * machine, so a link starts its minutes then.
 */
export interface ReleasePlan {
  release: string;
  archives: Record<string, { key: string; sha256: string }>;
  /** By the service whose machine it is: its env file and its boot account. */
  machines: Record<string, { env: string; bootAccount: string }>;
}

/** The plan of a release from its checked manifest and the env files the compose step wrote. */
export function releasePlan(sha: string, manifest: ReleaseManifest, envs: readonly MachineEnv[]): ReleasePlan {
  return {
    release: sha,
    archives: Object.fromEntries(
      Object.entries(manifest.images).map(([name, digest]) => [name, { key: releaseArchiveKey(sha, name), sha256: digest.sha256 }]),
    ),
    machines: Object.fromEntries(envs.map((env) => [env.service, { env: env.env, bootAccount: env.bootAccount }])),
  };
}

/** A record of string fields, by key, or a refusal naming the plan. */
function entries(value: unknown, fields: readonly string[], path: string): Record<string, Record<string, string>> {
  if (!isRecord(value)) throw new Error(`release plan ${path}: not a plan the deploy wrote`);
  return Object.fromEntries(
    Object.entries(value).map(([name, entry]) => {
      if (!isRecord(entry) || fields.some((field) => typeof entry[field] !== 'string'))
        throw new Error(`release plan ${path}: '${name}' is malformed`);
      return [name, Object.fromEntries(fields.map((field) => [field, String(entry[field])]))];
    }),
  );
}

/** Read the plan the deploy wrote; undefined without one, as in an apply or a preview, which make no machine of a new release. */
export function readReleasePlan(path: string | undefined): ReleasePlan | undefined {
  if (!path) return undefined;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!isRecord(parsed) || typeof parsed.release !== 'string') throw new Error(`release plan ${path}: not a plan the deploy wrote`);
  const archives = entries(parsed.archives, ['key', 'sha256'], path);
  const machines = entries(parsed.machines, ['env', 'bootAccount'], path);
  return {
    release: parsed.release,
    archives: Object.fromEntries(Object.entries(archives).map(([name, { key = '', sha256 = '' }]) => [name, { key, sha256 }])),
    machines: Object.fromEntries(Object.entries(machines).map(([name, { env = '', bootAccount = '' }]) => [name, { env, bootAccount }])),
  };
}
