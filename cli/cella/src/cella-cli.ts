#!/usr/bin/env tsx
/**
 * Cella CLI v2 - Main entry point
 *
 * Worktree-based merge approach that isolates all merge operations
 * from the main repository until the final atomic rsync copy.
 */

import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { parseCli } from './cli';
import { runAnalyze } from './services/analyze';
import { runAudit } from './services/audit';
import { runContributions } from './services/contributions';
import { runForks } from './services/forks';
import { runPackages } from './services/packages';
import { runStats } from './services/stats';
import { runSync } from './services/sync';
import { registerSignalHandlers } from './utils/cleanup';
import pc from './utils/colors';
import { loadConfig, resolveSyncBranch } from './utils/config';
import { warningMark } from './utils/display';
import { assertClean, createBranch, getCurrentBranch, localBranchExists } from './utils/git';

/**
 * Determine the fork path.
 *
 * Priority:
 * 1. CELLA_FORK_PATH environment variable
 * 2. Current working directory (where the CLI is run from)
 *
 * Note: When run via pnpm filter, cwd may be cli/cella - we detect and navigate up.
 */
function getForkPath(): string {
  const envPath = process.env.CELLA_FORK_PATH;
  if (envPath) {
    const resolved = resolve(envPath);
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      throw new Error(`CELLA_FORK_PATH is not a valid directory: ${resolved}`);
    }
    return resolved;
  }

  let cwd = process.cwd();

  // If running from within cli/cella (e.g., via pnpm --filter), go up to find the fork root
  if (cwd.endsWith('/cli/cella') || cwd.endsWith('\\cli\\cella')) {
    cwd = resolve(cwd, '../..');
  }

  return cwd;
}

/**
 * Pre-flight checks before running sync.
 */
async function preflight(
  forkPath: string,
  syncBranch: string,
  options: { skipCleanCheck?: boolean; warnOnBranch?: boolean } = {},
): Promise<void> {
  // Check we're in a git repository
  if (!existsSync(join(forkPath, '.git'))) {
    throw new Error(`not a git repository: ${forkPath}`);
  }

  // Check for uncommitted changes (skip for analyze/dry-run mode). Done before any
  // branch switch so auto-create only ever happens on a clean tree.
  if (!options.skipCleanCheck) {
    await assertClean(forkPath);
  }

  // Check we're on the sync branch
  const currentBranch = await getCurrentBranch(forkPath);
  if (currentBranch !== syncBranch) {
    if (options.warnOnBranch) {
      console.warn(
        `${warningMark} not on branch '${syncBranch}' (currently on '${currentBranch}'). results may differ from your sync branch.`,
      );
    } else if (!(await localBranchExists(forkPath, syncBranch))) {
      // First run: create the integration branch from the current branch so the sync
      // lands off `main` (which is squash-merge-only under release-please).
      await createBranch(forkPath, syncBranch);
      console.info(pc.green(`created and switched to sync branch '${syncBranch}' (from '${currentBranch}')`));
    } else {
      throw new Error(
        `must be on branch '${syncBranch}' to sync. currently on '${currentBranch}'. run: git switch ${syncBranch}`,
      );
    }
  }
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  // Register signal handlers for cleanup
  registerSignalHandlers();

  try {
    // Determine fork path
    const forkPath = getForkPath();

    // Load config
    const userConfig = await loadConfig(forkPath);

    // Parse CLI and get runtime config
    const config = await parseCli(userConfig, forkPath);

    // Run preflight checks (except for audit/forks/contributions/stats which don't need clean working dir)
    if (!['audit', 'forks', 'contributions', 'stats'].includes(config.service)) {
      const isReadOnly = config.service === 'analyze';
      await preflight(forkPath, resolveSyncBranch(userConfig.settings), {
        skipCleanCheck: isReadOnly,
        warnOnBranch: isReadOnly,
      });
    }

    // Route to service
    switch (config.service) {
      case 'analyze': {
        await runAnalyze(config);
        break;
      }

      case 'sync': {
        const result = await runSync(config);
        if (config.settings.syncWithPackages !== false) {
          // Run package sync even when the merge left conflicts: package.json files
          // that are themselves conflicted are skipped and reported; all others are
          // still synced so you get the latest upstream deps.
          await runPackages(config, { conflictedFiles: result.conflicts });
        }
        break;
      }

      case 'audit':
        await runAudit(config, { force: config.force, checkOverrides: config.checkOverrides });
        break;

      case 'forks':
        await runForks(config);
        break;

      case 'contributions':
        await runContributions(config);
        break;

      case 'stats':
        await runStats(config.forkPath, { verbose: config.verbose, refreshCoverage: config.coverage });
        break;
    }

    console.info();
  } catch (error) {
    console.error();
    console.error(`${pc.red('✗')} ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exit(1);
  }
}

main();
