/**
 * Contribute service for sync CLI.
 *
 * Fork-side: pushes drifted files to a `contrib/<fork-name>` branch in the
 * upstream local clone. The branch is always force-pushed as a single commit
 * on top of upstream's working branch, so the diff is always clean and current.
 *
 * Upstream can then review via `pnpm cella contributions`.
 */

import { copyFileSync, existsSync, lstatSync, mkdirSync, unlinkSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import pc from 'picocolors';
import type { AnalyzedFile, RuntimeConfig } from '../config/types';
import { createSpinner, spinnerFail, spinnerSuccess } from '../utils/display';
import { git } from '../utils/git';

/**
 * Push drifted files to a contrib branch in the upstream local clone.
 * Always force-pushes a single commit: upstream/branch + drifted files overlay.
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

  createSpinner(`contributing ${driftedFiles.length} drifted files to ${branchName}...`);

  // Save current branch to restore later
  let originalBranch: string;

  try {
    originalBranch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], upstreamPath);
  } catch {
    spinnerFail('could not read upstream branch');
    return false;
  }

  try {
    // Ensure we have latest upstream
    await git(['fetch', 'origin'], upstreamPath, { ignoreErrors: true });

    // Create or reset the contrib branch from upstream's working branch
    // Use origin/<branch> to ensure we start from the latest remote state
    const baseRef = `origin/${upstreamBranch}`;

    // Delete existing local branch if it exists (we always recreate)
    await git(['branch', '-D', branchName], upstreamPath, { ignoreErrors: true });

    // Create fresh branch from upstream's latest
    await git(['checkout', '-b', branchName, baseRef], upstreamPath);

    // Copy drifted files from fork to upstream
    const fileList: string[] = [];
    for (const file of driftedFiles) {
      const src = join(config.forkPath, file.path);
      const dest = join(upstreamPath, file.path);
      // Validate paths stay within their roots (CWE-22 path traversal)
      if (!resolve(src).startsWith(resolve(config.forkPath))) continue;
      if (!resolve(dest).startsWith(resolve(upstreamPath))) continue;
      // Skip symlinks to prevent symlink-following attacks (CWE-61)
      if (existsSync(src) && !lstatSync(src).isSymbolicLink()) {
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(src, dest);
        fileList.push(file.path);
      }
    }

    if (fileList.length === 0) {
      spinnerFail('no files to contribute');
      await git(['checkout', originalBranch], upstreamPath);
      await git(['branch', '-D', branchName], upstreamPath, { ignoreErrors: true });
      return false;
    }

    // Stage and commit
    await git(['add', ...fileList], upstreamPath);

    const commitBody = fileList.map((f) => `- ${f}`).join('\n');
    const commitMessage = `contrib(${forkName}): ${fileList.length} drifted files\n\n${commitBody}`;
    await git(['commit', '--no-verify', '-m', commitMessage], upstreamPath);

    // Force-push with lease — fetch first so the lease has a tracking ref
    await git(['fetch', 'origin', `${branchName}:refs/remotes/origin/${branchName}`], upstreamPath, {
      ignoreErrors: true,
    });
    await git(['push', '--force-with-lease', '-u', 'origin', branchName], upstreamPath);

    spinnerSuccess(`pushed ${fileList.length} files to ${pc.cyan(branchName)}`);

    return true;
  } catch (error) {
    spinnerFail(`contribute failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    return false;
  } finally {
    // Always restore original branch
    try {
      await git(['checkout', originalBranch!], upstreamPath);
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
