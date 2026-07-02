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
import { runStats } from './services/stats';
import { runSyncCommand } from './services/sync';
import { registerSignalHandlers } from './utils/cleanup';
import pc from './utils/colors';
import { loadConfig } from './utils/config';

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
 * Pre-flight checks before running a service.
 *
 * The sync service cuts its own ephemeral branch from the trunk and owns its own clean/resume
 * state, so preflight no longer cares which branch you are on or whether the tree is clean — it
 * only verifies we are inside a git repository.
 */
async function preflight(forkPath: string): Promise<void> {
  if (!existsSync(join(forkPath, '.git'))) {
    throw new Error(`not a git repository: ${forkPath}`);
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

    // Run preflight checks (except for services that operate on other fork paths)
    if (!['audit', 'forks', 'contributions', 'stats'].includes(config.service)) {
      await preflight(forkPath);
    }

    // Route to service
    switch (config.service) {
      case 'analyze': {
        await runAnalyze(config);
        break;
      }

      case 'sync': {
        await runSyncCommand(config);
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
