/**
 * Shared contribution engine.
 *
 * Cella (upstream) pulls a fork's branch and detects which files the fork
 * changed, created, or deleted relative to cella's base branch. It then builds
 * a clean local `contrib/<fork>` branch — built on top of the base branch with
 * only the fork's file overlays — so the changes can be reviewed and adopted
 * without a working-tree checkout.
 *
 * The fork's blobs are read directly from the fetched ref (already in cella's
 * object store), never from the filesystem.
 */

import { dirname, join } from 'node:path';
import type { CellaCliConfig, FileStatus } from '../config/types';
import { git } from '../utils/git';
import { isIgnored, isPinned, isUnderAnyFolder } from '../utils/overrides';
import { analyzeRefs, enrichChangeInfo } from './analyze-core';

/** A single contributable file with classification and metadata. */
export interface ContribFile {
  /** File path relative to repo root */
  path: string;
  /** How adopting this file changes cella */
  kind: 'modified' | 'created' | 'deleted';
  /** Analyzer status from cella's POV (behind = fork ahead, diverged = both changed) */
  status: FileStatus;
  /** Relative date of the fork's change (e.g. '3 days ago') */
  changedAt?: string;
}

/** Files a fork contributes relative to the base branch. */
export interface ContribDetection {
  /** Files changed in fork that also exist in base */
  modified: string[];
  /** New fork files in directories that exist in base (sibling heuristic) */
  created: string[];
  /** Files that exist in base but were removed in fork */
  deleted: string[];
  /** Enriched per-file metadata for the union of the above */
  files: ContribFile[];
}

/**
 * List all files tracked at a ref.
 */
async function listFilesAtRef(repoPath: string, ref: string): Promise<Set<string>> {
  const raw = await git(['ls-tree', '-r', '--name-only', ref], repoPath);
  return new Set(raw.split('\n').filter(Boolean));
}

/**
 * Detect the files a fork contributes relative to cella's base branch.
 *
 * Uses a merge-base 3-way analysis (cella = local, fork = incoming) so the
 * result distinguishes fork-ahead changes from cella's own drift. Only files
 * where the fork is ahead (status `behind`) or both sides changed (`diverged`)
 * are contributable.
 *
 * @param repoPath - Cella repo path (where the fork ref has been fetched)
 * @param baseRef - Cella's base branch ref (e.g. 'development')
 * @param forkRef - Fetched fork commit (e.g. a resolved FETCH_HEAD sha)
 * @param config - Cella's config, used to exclude ignored/pinned files
 * @param forkTerritory - Folders the fork owns (from the fork's own
 *   `ignoredFolders`); excluded so fork-specific modules aren't offered back
 */
export async function detectContributableFiles(
  repoPath: string,
  baseRef: string,
  forkRef: string,
  config: CellaCliConfig,
  forkTerritory: string[] = [],
): Promise<ContribDetection> {
  // Common ancestor for 3-way comparison; fall back to baseRef if histories are unrelated
  const mergeBase = (await git(['merge-base', baseRef, forkRef], repoPath, { ignoreErrors: true })).trim() || baseRef;

  const predicates = {
    isIgnored: (path: string) => isIgnored(path, config) || isUnderAnyFolder(path, forkTerritory),
    isPinned: (path: string) => isPinned(path, config),
  };

  // local = cella (baseRef), incoming = fork (forkRef)
  const analyzed = await analyzeRefs(repoPath, baseRef, forkRef, mergeBase, predicates);
  await enrichChangeInfo(repoPath, analyzed, mergeBase, baseRef, forkRef);

  // Base directory set for the sibling heuristic on created files
  const baseFiles = await listFilesAtRef(repoPath, baseRef);
  const baseDirs = new Set<string>();
  for (const f of baseFiles) {
    let dir = dirname(f);
    while (dir !== '.') {
      baseDirs.add(dir);
      dir = dirname(dir);
    }
  }

  const files: ContribFile[] = [];
  for (const file of analyzed) {
    // Only files where the fork is ahead of cella are contributable
    if (file.status !== 'behind' && file.status !== 'diverged') continue;
    if (file.isIgnored || file.isPinned) continue;

    const inCella = file.existsInFork; // local side
    const inFork = file.existsInUpstream; // incoming side

    let kind: ContribFile['kind'];
    if (inCella && !inFork) {
      kind = 'deleted';
    } else if (!inCella && inFork) {
      // New fork file: only offer it when its directory already exists in cella,
      // so fork-specific modules don't flood the list (territory handles the rest)
      if (!baseDirs.has(dirname(file.path))) continue;
      kind = 'created';
    } else {
      kind = 'modified';
    }

    // Fork-side change date: 'behind' stores it in changedAt, 'diverged' in upstreamChangedAt
    const changedAt = file.status === 'diverged' ? file.upstreamChangedAt : file.changedAt;
    files.push({ path: file.path, kind, status: file.status, changedAt });
  }

  return {
    modified: files.filter((f) => f.kind === 'modified').map((f) => f.path),
    created: files.filter((f) => f.kind === 'created').map((f) => f.path),
    deleted: files.filter((f) => f.kind === 'deleted').map((f) => f.path),
    files,
  };
}

/** Total number of files in a detection result. */
export function countDetection(detection: ContribDetection): number {
  return detection.modified.length + detection.created.length + detection.deleted.length;
}

/**
 * Read mode and blob hash for a file at a ref.
 * Returns null if the path is not a regular blob at the ref.
 */
async function readBlobInfo(
  repoPath: string,
  ref: string,
  filePath: string,
): Promise<{ mode: string; hash: string } | null> {
  const line = await git(['ls-tree', ref, '--', filePath], repoPath, { ignoreErrors: true });
  if (!line) return null;
  // Format: "<mode> <type> <hash>\t<path>"
  const match = line.match(/^(\d{6}) (\w+) ([0-9a-f]+)\t/);
  if (!match) return null;
  const [, mode, type, hash] = match;
  if (type !== 'blob') return null;
  // Only allow regular (100644) and executable (100755) file modes; skip symlinks/gitlinks
  if (mode !== '100644' && mode !== '100755') return null;
  return { mode, hash };
}

/**
 * Build a clean local `contrib/<fork>` branch from a fork's contributed files.
 *
 * The branch is created on top of `baseRef` with only the fork's file overlays
 * applied via a temporary index — the working tree is never touched.
 *
 * @returns The branch name and number of files applied.
 */
export async function buildContribBranch(
  repoPath: string,
  baseRef: string,
  forkRef: string,
  detection: ContribDetection,
  forkName: string,
): Promise<{ branch: string; appliedFiles: string[] }> {
  const branch = `contrib/${forkName}`;
  const tmpIndex = join(repoPath, '.git', `tmp-contrib-index-${forkName.replace(/[^\w.-]/g, '_')}`);
  const indexEnv = { GIT_INDEX_FILE: tmpIndex };

  try {
    // Seed the temp index with cella's base tree
    await git(['read-tree', baseRef], repoPath, { env: indexEnv });

    const appliedFiles: string[] = [];

    // Overlay modified + created fork files (blobs already in object store via fetch)
    for (const filePath of [...detection.modified, ...detection.created]) {
      const blob = await readBlobInfo(repoPath, forkRef, filePath);
      if (!blob) continue;
      await git(
        ['update-index', '--add', '--replace', '--cacheinfo', `${blob.mode},${blob.hash},${filePath}`],
        repoPath,
        {
          env: indexEnv,
        },
      );
      appliedFiles.push(filePath);
    }

    // Remove deleted files from the index
    for (const filePath of detection.deleted) {
      await git(['update-index', '--remove', filePath], repoPath, { env: indexEnv, ignoreErrors: true });
      appliedFiles.push(`(deleted) ${filePath}`);
    }

    if (appliedFiles.length === 0) {
      return { branch, appliedFiles };
    }

    // Write tree and commit on top of base
    const treeHash = await git(['write-tree'], repoPath, { env: indexEnv });
    const parentHash = await git(['rev-parse', baseRef], repoPath);
    const commitBody = appliedFiles.map((f) => `- ${f}`).join('\n');
    const commitMessage = `contrib(${forkName}): ${appliedFiles.length} files\n\n${commitBody}`;
    const commitHash = await git(['commit-tree', treeHash, '-p', parentHash, '-m', commitMessage], repoPath);

    // Create/update the local branch ref without checkout
    await git(['update-ref', `refs/heads/${branch}`, commitHash], repoPath);

    return { branch, appliedFiles };
  } finally {
    try {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(tmpIndex);
    } catch {
      // Best effort
    }
  }
}
