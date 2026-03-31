/**
 * Contribute service for sync CLI.
 *
 * Detects modified cella files in the fork using git set intersection,
 * discovers new sibling files, detects deletions, then creates a PR
 * branch in the upstream local clone via `gh pr create --repo`.
 *
 * Also contains legacy pushContribBranch (force-push single-commit)
 * and pushPinnedBranch helpers used by other services.
 */

import { execFile } from 'node:child_process';
import { existsSync, lstatSync, unlinkSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { confirm } from '@inquirer/prompts';
import pc from 'picocolors';
import type { AnalyzedFile, RuntimeConfig } from '../config/types';
import { createSpinner, spinnerFail, spinnerSuccess } from '../utils/display';
import { git } from '../utils/git';

const execFileAsync = promisify(execFile);

/**
 * Run the contribute service: detect contributable files and create a PR in upstream.
 *
 * Detection strategy:
 * 1. Git set intersection: files that exist in both fork and upstream AND are changed
 * 2. Directory-sibling heuristic: new fork files in directories that exist upstream
 * 3. Deletion detection: files that exist upstream but were deleted in fork
 *
 * Subtracts ignored and pinned files from the set.
 */
export async function runContribute(config: RuntimeConfig): Promise<void> {
  const { upstreamLocalPath, upstreamRepo, upstreamBranch } = config.settings;

  if (!upstreamLocalPath) {
    throw new Error('upstreamLocalPath is required in cella.config.ts to use the contribute service');
  }

  const upstreamPath = resolve(config.forkPath, upstreamLocalPath);
  if (!existsSync(upstreamPath)) {
    throw new Error(`upstream local clone not found at: ${upstreamPath}`);
  }

  const forkName = basename(config.forkPath);
  const upstreamRef = config.upstreamRef;
  const ignored = new Set(config.overrides?.ignored ?? []);
  const pinned = new Set(config.overrides?.pinned ?? []);

  createSpinner('detecting contributable files...');

  // 1. Get upstream file list
  const upstreamFilesRaw = await git(['ls-tree', '-r', '--name-only', upstreamRef], config.forkPath);
  const upstreamFiles = new Set(upstreamFilesRaw.split('\n').filter(Boolean));

  // 2. Get fork changed files (relative to upstream)
  const changedFilesRaw = await git(['diff', '--name-only', `${upstreamRef}...HEAD`], config.forkPath);
  const changedFiles = changedFilesRaw.split('\n').filter(Boolean);

  // 3. Get fork's full file list
  const forkFilesRaw = await git(['ls-tree', '-r', '--name-only', 'HEAD'], config.forkPath);
  const forkFiles = new Set(forkFilesRaw.split('\n').filter(Boolean));

  // Build upstream directory set for sibling detection
  const upstreamDirs = new Set<string>();
  for (const f of upstreamFiles) {
    let dir = dirname(f);
    while (dir !== '.') {
      upstreamDirs.add(dir);
      dir = dirname(dir);
    }
  }

  // Helper: check if path matches any ignored/pinned pattern
  const isExcluded = (path: string) => ignored.has(path) || pinned.has(path) || matchesIgnoredPattern(path, ignored);

  // Modified: files changed in fork that also exist upstream
  const modifiedFiles: string[] = [];
  // Deleted: files that exist upstream but were removed in fork
  const deletedFiles: string[] = [];
  // Created: new fork files in directories that exist upstream
  const createdFiles: string[] = [];

  for (const f of changedFiles) {
    if (isExcluded(f)) continue;
    if (upstreamFiles.has(f) && forkFiles.has(f)) {
      modifiedFiles.push(f);
    } else if (upstreamFiles.has(f) && !forkFiles.has(f)) {
      deletedFiles.push(f);
    } else if (!upstreamFiles.has(f) && forkFiles.has(f) && upstreamDirs.has(dirname(f))) {
      createdFiles.push(f);
    }
  }

  const total = modifiedFiles.length + deletedFiles.length + createdFiles.length;
  spinnerSuccess(`${total} contributable files`);

  if (total === 0) {
    console.info(pc.dim('no files to contribute.'));
    return;
  }

  // Show summary counts
  console.info();
  if (modifiedFiles.length > 0) console.info(`  ${pc.cyan(`${modifiedFiles.length}`)} modified`);
  if (createdFiles.length > 0) console.info(`  ${pc.green(`${createdFiles.length}`)} created`);
  if (deletedFiles.length > 0) console.info(`  ${pc.yellow(`${deletedFiles.length}`)} deleted`);
  console.info();

  const proceed = await confirm({
    message: `create PR with ${total} file change(s) in upstream?`,
    default: true,
  });

  if (!proceed) {
    console.info(pc.dim('cancelled.'));
    return;
  }

  // All files to add/overlay
  const contributeFiles = [...modifiedFiles, ...createdFiles];
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8);
  const branchName = `contrib/${forkName}-${timestamp}`;
  const tmpIndex = join(upstreamPath, '.git', 'tmp-contrib-index');

  createSpinner(`creating branch ${pc.cyan(branchName)}...`);

  try {
    // Fetch latest upstream
    await git(['fetch', 'origin'], upstreamPath, { ignoreErrors: true });

    const baseRef = `origin/${upstreamBranch}`;
    const indexEnv = { GIT_INDEX_FILE: tmpIndex };

    // Read upstream branch tree into temp index
    await git(['read-tree', baseRef], upstreamPath, { env: indexEnv });

    // Overlay fork files into the temp index
    const appliedFiles: string[] = [];
    for (const filePath of contributeFiles) {
      const src = join(config.forkPath, filePath);
      // Validate path stays within fork root (CWE-22)
      if (!resolve(src).startsWith(resolve(config.forkPath))) continue;
      // Skip symlinks (CWE-61)
      if (!existsSync(src) || lstatSync(src).isSymbolicLink()) continue;

      try {
        const blobHash = await git(['hash-object', '-w', src], upstreamPath);
        await git(['update-index', '--replace', '--cacheinfo', `100644,${blobHash},${filePath}`], upstreamPath, {
          env: indexEnv,
        });
        appliedFiles.push(filePath);
      } catch {
        // Skip files that fail to hash
      }
    }

    // Remove deleted files from the index
    for (const filePath of deletedFiles) {
      try {
        await git(['update-index', '--remove', filePath], upstreamPath, { env: indexEnv });
        appliedFiles.push(`(deleted) ${filePath}`);
      } catch {
        // Skip if not in index
      }
    }

    if (appliedFiles.length === 0) {
      spinnerFail('no files could be applied');
      return;
    }

    // Write tree from temp index
    const treeHash = await git(['write-tree'], upstreamPath, { env: indexEnv });

    // Create commit on top of upstream branch
    const parentHash = await git(['rev-parse', baseRef], upstreamPath);
    const commitBody = appliedFiles.map((f) => `- ${f}`).join('\n');
    const commitMessage = `contrib(${forkName}): ${appliedFiles.length} files\n\n${commitBody}`;
    const commitHash = await git(['commit-tree', treeHash, '-p', parentHash, '-m', commitMessage], upstreamPath);

    // Create branch ref
    await git(['update-ref', `refs/heads/${branchName}`, commitHash], upstreamPath);

    // Push branch (regular push, not force)
    await git(['push', '-u', 'origin', branchName], upstreamPath);

    spinnerSuccess(`pushed ${appliedFiles.length} files to ${pc.cyan(branchName)}`);

    // Create PR if upstreamRepo is configured
    if (upstreamRepo) {
      createSpinner('creating pull request...');
      try {
        const prTitle = `contrib(${forkName}): ${appliedFiles.length} file changes`;
        const prBody = `Contribution from fork \`${forkName}\`.\n\n### Changes\n${commitBody}`;
        const { stdout } = await execFileAsync(
          'gh',
          [
            'pr',
            'create',
            '--repo',
            upstreamRepo,
            '--base',
            upstreamBranch,
            '--head',
            branchName,
            '--title',
            prTitle,
            '--body',
            prBody,
          ],
          { cwd: upstreamPath },
        );
        spinnerSuccess(`PR created: ${stdout.trim()}`);
      } catch (error) {
        spinnerFail(`PR creation failed: ${error instanceof Error ? error.message : 'unknown error'}`);
        console.info(pc.dim(`  branch ${branchName} was pushed — create PR manually`));
      }
    } else {
      console.info(pc.dim('  tip: set upstreamRepo in cella.config.ts to auto-create PRs'));
    }
  } catch (error) {
    spinnerFail(`contribute failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  } finally {
    try {
      unlinkSync(tmpIndex);
    } catch {
      // Best effort
    }
  }
}

/**
 * Check if a file path matches any glob pattern in the ignored set.
 * Simple implementation: supports trailing /** for directory patterns.
 */
function matchesIgnoredPattern(filePath: string, ignoredPatterns: Set<string>): boolean {
  for (const pattern of ignoredPatterns) {
    if (pattern.endsWith('/**')) {
      const dir = pattern.slice(0, -3);
      if (filePath.startsWith(`${dir}/`)) return true;
    } else if (pattern.endsWith('/*')) {
      const dir = pattern.slice(0, -2);
      if (filePath.startsWith(`${dir}/`) && !filePath.slice(dir.length + 1).includes('/')) return true;
    }
  }
  return false;
}

/**
 * Push drifted and diverged files to a contrib branch in the upstream local clone.
 * Always force-pushes a single commit: upstream/branch + fork files overlay.
 *
 * Uses git plumbing to avoid checkout — never touches the working tree.
 *
 * @returns true if files were pushed, false if skipped/failed
 */
export async function pushContribBranch(files: AnalyzedFile[], config: RuntimeConfig): Promise<boolean> {
  const upstreamLocalPath = config.settings.upstreamLocalPath;

  if (!upstreamLocalPath) {
    return false;
  }

  const upstreamPath = resolve(config.forkPath, upstreamLocalPath);
  if (!existsSync(upstreamPath)) {
    return false;
  }

  if (files.length === 0) {
    return false;
  }

  const forkName = basename(config.forkPath);
  const branchName = `contrib/${forkName}`;
  const upstreamBranch = config.settings.upstreamBranch;
  const tmpIndex = join(upstreamPath, '.git', 'tmp-contrib-index');

  createSpinner(`contributing ${files.length} files to ${branchName}...`);

  try {
    // Ensure we have latest upstream
    await git(['fetch', 'origin'], upstreamPath, { ignoreErrors: true });

    const baseRef = `origin/${upstreamBranch}`;
    const indexEnv = { GIT_INDEX_FILE: tmpIndex };

    // Read upstream branch tree into temp index
    await git(['read-tree', baseRef], upstreamPath, { env: indexEnv });

    // Overlay fork files into the temp index
    const fileList: string[] = [];
    for (const file of files) {
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
    const commitMessage = `contrib(${forkName}): ${fileList.length} files\n\n${commitBody}`;
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
