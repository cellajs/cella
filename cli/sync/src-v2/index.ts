#!/usr/bin/env tsx
/**
 * Sync CLI v2 - Main entry point
 *
 * Worktree-based merge approach that isolates all merge operations
 * from the main repository until the final atomic rsync copy.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pc from 'picocolors';
import { parseCli } from './cli';
import type { CellaSyncConfig } from './config/types';
import { runAnalyze } from './services/analyze';
import { runPackages } from './services/packages';
import { runSync } from './services/sync';
import { runValidate } from './services/validate';
import { registerSignalHandlers } from './utils/cleanup';
import { DIVIDER } from './utils/display';
import { getCurrentBranch, isClean } from './utils/git';

/**
 * Load cella.config.ts from the fork path.
 */
async function loadConfig(forkPath: string): Promise<CellaSyncConfig> {
  const configPath = join(forkPath, 'cella.config.ts');

  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
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
 * 2. Resolved from import.meta.dirname (src-v2 is 3 levels deep from monorepo root)
 */
function getForkPath(): string {
  const envPath = process.env.CELLA_FORK_PATH;
  if (envPath) {
    return resolve(envPath);
  }
  // Resolve from file location: src-v2/index.ts -> cli/sync -> cli -> monorepo root
  return resolve(import.meta.dirname, '../../..');
}

/**
 * Pre-flight checks before running sync.
 */
async function preflight(forkPath: string, forkBranch: string): Promise<void> {
  // Check we're in a git repository
  if (!existsSync(join(forkPath, '.git'))) {
    throw new Error(`Not a git repository: ${forkPath}`);
  }

  // Check we're on the correct branch
  const currentBranch = await getCurrentBranch(forkPath);
  if (currentBranch !== forkBranch) {
    throw new Error(`Must be on branch '${forkBranch}' to sync. Currently on '${currentBranch}'.`);
  }

  // Check for uncommitted changes
  const clean = await isClean(forkPath);
  if (!clean) {
    throw new Error('Working directory has uncommitted changes. Please commit or stash before syncing.');
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

    // Run preflight checks (except for packages which doesn't need clean working dir)
    if (config.service !== 'packages') {
      await preflight(forkPath, userConfig.forkBranch);
    }

    // Route to service
    switch (config.service) {
      case 'analyze':
        await runAnalyze(config);
        break;

      case 'sync': {
        const result = await runSync(config);

        // Run validation after successful sync
        if (result.success && result.conflicts.length === 0) {
          console.info();
          console.info(DIVIDER);
          console.info();
          const valid = await runValidate(config);
          if (!valid) {
            console.info();
            console.info(pc.yellow('Validation failed. Please fix issues before committing.'));
          }
        }
        break;
      }

      case 'packages':
        await runPackages(config);
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
