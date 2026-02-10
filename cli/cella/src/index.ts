#!/usr/bin/env tsx
/**
 * Cella CLI v2 - Main entry point
 *
 * Worktree-based merge approach that isolates all merge operations
 * from the main repository until the final atomic rsync copy.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pc from 'picocolors';
import { parseCli } from './cli';
import type { CellaCliConfig } from './config/types';
import { runAnalyze } from './services/analyze';
import { runAudit } from './services/audit';
import { runForks } from './services/forks';
import { runInspect } from './services/inspect';
import { runPackages } from './services/packages';
import { runSync } from './services/sync';
import { registerSignalHandlers } from './utils/cleanup';
import { getCurrentBranch, isClean } from './utils/git';

/**
 * Load cella.config.ts from the fork path.
 */
async function loadConfig(forkPath: string): Promise<CellaCliConfig> {
  const configPath = join(forkPath, 'cella.config.ts');

  if (!existsSync(configPath)) {
    throw new Error(`config file not found: ${configPath}`);
  }

  // Dynamic import of the config
  const configModule = await import(configPath);
  return configModule.default;
}

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
    return resolve(envPath);
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
        `${pc.yellow('⚠')} not on branch '${forkBranch}' (currently on '${currentBranch}'). results may differ from your sync branch.`,
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

    // Run preflight checks (except for packages/audit/forks which don't need clean working dir)
    if (!['packages', 'audit', 'forks'].includes(config.service)) {
      const isReadOnly = config.service === 'analyze' || config.service === 'inspect';
      await preflight(forkPath, userConfig.settings.forkBranch, {
        skipCleanCheck: isReadOnly,
        warnOnBranch: isReadOnly,
      });
    }

    // Route to service
    switch (config.service) {
      case 'analyze':
        await runAnalyze(config);
        break;

      case 'inspect':
        await runInspect(config);
        break;

      case 'sync':
        await runSync(config);
        break;

      case 'packages':
        await runPackages(config);
        break;

      case 'audit':
        await runAudit(config);
        break;

      case 'forks':
        await runForks(config);
        break;
    }

    console.info();
  } catch (error) {
    console.error();
    console.error(`${pc.red('✗')} ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
