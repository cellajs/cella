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
import { runContribute } from './services/contribute';
import { runContributions } from './services/contributions';
import { runForks } from './services/forks';
import { runInspect } from './services/inspect';
import { runPackages } from './services/packages';
import { runStats } from './services/stats';
import { runSync } from './services/sync';
import { registerSignalHandlers } from './utils/cleanup';
import pc from './utils/colors';
import { loadConfig } from './utils/config';
import { warningMark } from './utils/display';
import { getCurrentBranch, isClean } from './utils/git';

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
  forkBranch: string,
  options: { skipCleanCheck?: boolean; warnOnBranch?: boolean } = {},
): Promise<void> {
  // Check we're in a git repository
  if (!existsSync(join(forkPath, '.git'))) {
    throw new Error(`not a git repository: ${forkPath}`);
  }

  // Check we're on the correct branch
  const currentBranch = await getCurrentBranch(forkPath);
  if (currentBranch !== forkBranch) {
    if (options.warnOnBranch) {
      console.warn(
        `${warningMark} not on branch '${forkBranch}' (currently on '${currentBranch}'). results may differ from your sync branch.`,
      );
    } else {
      throw new Error(`must be on branch '${forkBranch}' to sync. currently on '${currentBranch}'.`);
    }
  }

  // Check for uncommitted changes (skip for analyze/dry-run mode)
  if (!options.skipCleanCheck) {
    const clean = await isClean(forkPath);
    if (!clean) {
      throw new Error('working directory has uncommitted changes. please commit or stash before syncing.');
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

    // Run preflight checks (except for packages/audit/forks/contributions/contribute/stats which don't need clean working dir)
    if (!['packages', 'audit', 'forks', 'contributions', 'contribute', 'stats'].includes(config.service)) {
      const isReadOnly = config.service === 'analyze' || config.service === 'inspect';
      await preflight(forkPath, userConfig.settings.forkBranch, {
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

      case 'inspect':
        await runInspect(config);
        break;

      case 'sync': {
        const result = await runSync(config);
        if (config.settings.syncWithPackages !== false && result.success) {
          await runPackages(config);
        }
        break;
      }

      case 'packages':
        await runPackages(config);
        break;

      case 'audit':
        await runAudit(config, { force: config.force, checkOverrides: config.checkOverrides });
        break;

      case 'contribute':
        await runContribute(config);
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
