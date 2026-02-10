/**
 * Contribute service for sync CLI.
 *
 * Fork-side: pushes drifted files to a `contrib/<fork-name>` branch in the
 * upstream local clone. The branch is always force-pushed as a single commit
 * on top of upstream's working branch, so the diff is always clean and current.
 *
 * Upstream can then review via `pnpm cella contributions`.
 */

import { copyFileSync, existsSync, lstatSync, mkdirSync } from 'node:fs';
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

    // Force-push to upstream remote
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
