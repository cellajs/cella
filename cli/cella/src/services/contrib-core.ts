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
import type { CellaCliConfig } from '../config/types';
import { git } from '../utils/git';
import { isIgnored, isPinned } from '../utils/overrides';

/** Files a fork contributes relative to the base branch. */
export interface ContribDetection {
  /** Files changed in fork that also exist in base */
  modified: string[];
  /** New fork files in directories that exist in base (sibling heuristic) */
  created: string[];
  /** Files that exist in base but were removed in fork */
  deleted: string[];
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
 * @param repoPath - Cella repo path (where the fork ref has been fetched)
 * @param baseRef - Cella's base branch ref (e.g. 'development')
 * @param forkRef - Fetched fork commit (e.g. a resolved FETCH_HEAD sha)
 * @param config - Cella's config, used to exclude ignored/pinned files
 */
export async function detectContributableFiles(
  repoPath: string,
  baseRef: string,
  forkRef: string,
  config: CellaCliConfig,
): Promise<ContribDetection> {
  const [baseFiles, forkFiles] = await Promise.all([
    listFilesAtRef(repoPath, baseRef),
    listFilesAtRef(repoPath, forkRef),
  ]);

  // Files that differ between base and fork (direct tree comparison, not merge-base)
  const changedRaw = await git(['diff', '--name-only', baseRef, forkRef], repoPath, { ignoreErrors: true });
  const changedFiles = changedRaw.split('\n').filter(Boolean);

  // Build base directory set for sibling detection of created files
  const baseDirs = new Set<string>();
  for (const f of baseFiles) {
    let dir = dirname(f);
    while (dir !== '.') {
      baseDirs.add(dir);
      dir = dirname(dir);
    }
  }

  const isExcluded = (path: string) => isIgnored(path, config) || isPinned(path, config);

  const modified: string[] = [];
  const created: string[] = [];
  const deleted: string[] = [];

  for (const f of changedFiles) {
    if (isExcluded(f)) continue;
    if (baseFiles.has(f) && forkFiles.has(f)) {
      modified.push(f);
    } else if (baseFiles.has(f) && !forkFiles.has(f)) {
      deleted.push(f);
    } else if (!baseFiles.has(f) && forkFiles.has(f) && baseDirs.has(dirname(f))) {
      created.push(f);
    }
  }

  return { modified, created, deleted };
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
