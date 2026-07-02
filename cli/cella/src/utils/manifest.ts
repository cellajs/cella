/**
 * Cella sync manifest.
 *
 * A committed record of the last upstream sync point, living at the fork repo root as
 * `cella.manifest.json`. It serves two purposes:
 *  1. Machine: `upstream.commit` is the bootstrap seed `ensureSyncBase` uses to reconstruct
 *     the merge-base on a clone that has no local `refs/cella/last-sync` (fresh clone, CI, a
 *     second maintainer). Committed, so it travels with the repo — unlike the local ref.
 *  2. Human: records the upstream repo, tracking mode, release/commit and a GitHub link, so
 *     each sync PR shows exactly which upstream point you moved to.
 *
 * Written and staged by the sync engine on every applied sync, so it stays in lockstep with
 * `refs/cella/last-sync` and rides along in the sync commit.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Committed manifest filename at the fork repo root. */
export const MANIFEST_FILE = 'cella.manifest.json';

/** The last upstream sync point recorded in {@link MANIFEST_FILE}. */
export interface SyncManifest {
  upstream: {
    /** GitHub slug of the upstream repo, e.g. 'cellajs/cella'. */
    repo?: string;
    /** Tracking mode at sync time. */
    track?: 'release' | 'branch';
    /** Integrated upstream commit SHA — the merge-base bootstrap seed. */
    commit: string;
    /** Release tag when tracking releases, else null. */
    release?: string | null;
    /** Human-readable link to the commit or release on GitHub. */
    url?: string;
    /** UTC timestamp of the sync (ISO 8601). */
    syncedAt?: string;
  };
}

/** Read and validate the manifest. Returns null when absent or malformed. */
export async function readSyncManifest(cwd: string): Promise<SyncManifest | null> {
  try {
    const parsed = JSON.parse(await readFile(join(cwd, MANIFEST_FILE), 'utf8')) as SyncManifest;
    const commit = parsed?.upstream?.commit;
    if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/i.test(commit)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Return the recorded upstream base commit SHA, or null.
 * Bootstrap seed for {@link ensureSyncBase} when no local `refs/cella/last-sync` exists.
 */
export async function readManifestBase(cwd: string): Promise<string | null> {
  const manifest = await readSyncManifest(cwd);
  return manifest ? manifest.upstream.commit.toLowerCase() : null;
}

/** Write the manifest as pretty JSON with a trailing newline. */
export async function writeSyncManifest(cwd: string, manifest: SyncManifest): Promise<void> {
  await writeFile(join(cwd, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
