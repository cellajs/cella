/**
 * Contribute service for sync CLI.
 *
 * Fork-side: pushes drifted files to a `contrib/<fork-name>` branch in the
 * upstream local clone. The branch is always force-pushed as a single commit
 * on top of upstream's working branch, so the diff is always clean and current.
 *
 * Uses git plumbing commands (temp index + hash-object + commit-tree +
 * update-ref) so it never touches the working tree — safe to call even
 * when the upstream clone has staged changes or is on a different branch.
 *
 * Upstream can then review via `pnpm cella contributions`.
 */

import { existsSync, lstatSync, unlinkSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import pc from 'picocolors';
import type { AnalyzedFile, RuntimeConfig } from '../config/types';
import { createSpinner, spinnerFail, spinnerSuccess } from '../utils/display';
import { git } from '../utils/git';

/**
 * Push drifted files to a contrib branch in the upstream local clone.
 * Always force-pushes a single commit: upstream/branch + drifted files overlay.
 *
 * Uses git plumbing to avoid checkout — never touches the working tree.
 *
 * @returns true if files were pushed, false if skipped/failed
 */
export async function pushContribBranch(driftedFiles: AnalyzedFile[], config: RuntimeConfig): Promise<boolean> {
  const upstreamLocalPath = config.settings.upstreamLocalPath;

  if (!upstreamLocalPath) {
    return false;
  }

  const upstreamPath = resolve(config.forkPath, upstreamLocalPath);
  if (!existsSync(upstreamPath)) {
    return false;
  }

  if (driftedFiles.length === 0) {
    return false;
  }

  const forkName = basename(config.forkPath);
  const branchName = `contrib/${forkName}`;
  const upstreamBranch = config.settings.upstreamBranch;
  const tmpIndex = join(upstreamPath, '.git', 'tmp-contrib-index');

  createSpinner(`contributing ${driftedFiles.length} drifted files to ${branchName}...`);

  try {
    // Ensure we have latest upstream
    await git(['fetch', 'origin'], upstreamPath, { ignoreErrors: true });

    const baseRef = `origin/${upstreamBranch}`;
    const indexEnv = { GIT_INDEX_FILE: tmpIndex };

    // Read upstream branch tree into temp index
    await git(['read-tree', baseRef], upstreamPath, { env: indexEnv });

    // Overlay drifted files from fork into the temp index
    const fileList: string[] = [];
    for (const file of driftedFiles) {
      const src = join(config.forkPath, file.path);
      // Validate path stays within fork root (CWE-22 path traversal)
      if (!resolve(src).startsWith(resolve(config.forkPath))) continue;
      // Skip symlinks to prevent symlink-following attacks (CWE-61)
      if (!existsSync(src) || lstatSync(src).isSymbolicLink()) continue;

      try {
        // Hash the fork file into upstream's object store
        const blobHash = await git(['hash-object', '-w', src], upstreamPath);

        // Update temp index with the new blob
        await git(['update-index', '--replace', '--cacheinfo', `100644,${blobHash},${file.path}`], upstreamPath, {
          env: indexEnv,
        });
        fileList.push(file.path);
      } catch {
        // Skip files that fail to hash
      }
    }

    if (fileList.length === 0) {
      spinnerFail('no files to contribute');
      return false;
    }

    // Write tree from temp index
    const treeHash = await git(['write-tree'], upstreamPath, { env: indexEnv });

    // Create commit on top of upstream branch
    const parentHash = await git(['rev-parse', baseRef], upstreamPath);
    const commitBody = fileList.map((f) => `- ${f}`).join('\n');
    const commitMessage = `contrib(${forkName}): ${fileList.length} drifted files\n\n${commitBody}`;
    const commitHash = await git(['commit-tree', treeHash, '-p', parentHash, '-m', commitMessage], upstreamPath);

    // Update branch ref without checkout
    await git(['update-ref', `refs/heads/${branchName}`, commitHash], upstreamPath);

    // Prune stale tracking refs (handles branches deleted on remote)
    await git(['remote', 'prune', 'origin'], upstreamPath, { ignoreErrors: true });

    // Fetch remote branch so --force-with-lease has a current tracking ref
    await git(['fetch', 'origin', `${branchName}:refs/remotes/origin/${branchName}`], upstreamPath, {
      ignoreErrors: true,
    });

    // Force-push with lease; fall back to --force if lease is stale (branch was deleted & recreated)
    try {
      await git(['push', '--force-with-lease', '-u', 'origin', branchName], upstreamPath);
    } catch {
      await git(['push', '--force', '-u', 'origin', branchName], upstreamPath);
    }

    spinnerSuccess(`pushed ${fileList.length} files to ${pc.cyan(branchName)}`);

    return true;
  } catch (error) {
    spinnerFail(`contribute failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    return false;
  } finally {
    // Clean up temp index
    try {
      unlinkSync(tmpIndex);
    } catch {
      // Best effort
    }
  }
}

/**
 * Push upstream versions of pinned files to a local `upstream/pinned` branch.
 *
 * Uses git plumbing commands (temp index + commit-tree + update-ref) so it
 * never touches the working tree — safe to call even when staged changes
 * or merge state exist (e.g., right after sync).
 *
 * The resulting branch, when diffed against the fork's working branch,
 * shows exactly what upstream's versions of the pinned files look like.
 *
 * @returns true if branch was updated, false if skipped/failed
 */
export async function pushPinnedBranch(config: RuntimeConfig): Promise<boolean> {
  const pinnedFiles = config.overrides?.pinned || [];
  if (pinnedFiles.length === 0) return false;

  const forkPath = config.forkPath;
  const branchName = 'upstream/pinned';
  const upstreamRef = config.upstreamRef;
  const tmpIndex = join(forkPath, '.git', 'tmp-pinned-index');

  createSpinner(`updating ${pc.cyan(branchName)}...`);

  try {
    const indexEnv = { GIT_INDEX_FILE: tmpIndex };

    // Read current HEAD tree into temp index (fork's full tree as baseline)
    await git(['read-tree', 'HEAD'], forkPath, { env: indexEnv });

    // Overlay upstream versions of each pinned file
    const overlaid: string[] = [];
    for (const filePath of pinnedFiles) {
      try {
        // Get file mode + hash from upstream: "<mode> blob <hash>\t<path>"
        const lsOutput = await git(['ls-tree', upstreamRef, '--', filePath], forkPath);
        if (!lsOutput) continue;

        const match = lsOutput.match(/^(\d+)\s+\w+\s+([0-9a-f]+)\t/);
        if (!match) continue;

        const [, mode, hash] = match;
        await git(['update-index', '--replace', '--cacheinfo', `${mode},${hash},${filePath}`], forkPath, {
          env: indexEnv,
        });
        overlaid.push(filePath);
      } catch {
        // File doesn't exist in upstream, skip
      }
    }

    if (overlaid.length === 0) {
      spinnerFail('no pinned files found in upstream');
      return false;
    }

    // Write tree from temp index
    const treeHash = await git(['write-tree'], forkPath, { env: indexEnv });

    // Create commit (parent = HEAD so diff against fork branch is clean)
    const parentHash = await git(['rev-parse', 'HEAD'], forkPath);
    const commitBody = overlaid.map((f) => `- ${f}`).join('\n');
    const commitMessage = `upstream/pinned: ${overlaid.length} files from upstream\n\n${commitBody}`;
    const commitHash = await git(['commit-tree', treeHash, '-p', parentHash, '-m', commitMessage], forkPath);

    // Update branch ref without checkout
    await git(['update-ref', `refs/heads/${branchName}`, commitHash], forkPath);

    // Fetch remote branch first so --force-with-lease has a tracking ref.
    // Without this, the lease check has nothing to compare against and
    // behaves like --force, silently overwriting unexpected remote commits.
    await git(['fetch', 'origin', `${branchName}:refs/remotes/origin/${branchName}`], forkPath, { ignoreErrors: true });

    // Force-push with lease — fails if someone committed to the remote
    // branch since our fetch, preventing accidental data loss.
    await git(['push', '--force-with-lease', '-u', 'origin', branchName], forkPath);

    spinnerSuccess(`pushed ${overlaid.length} files to ${pc.cyan(branchName)}`);
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'unknown error';
    if (msg.includes('stale info') || msg.includes('failed to push')) {
      spinnerFail(`${branchName}: remote has unexpected commits — someone may have pushed to this branch`);
    } else {
      spinnerFail(`${branchName} failed: ${msg}`);
    }
    return false;
  } finally {
    // Clean up temp index
    try {
      unlinkSync(tmpIndex);
    } catch {
      // Best effort
    }
  }
}
