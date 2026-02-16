/**
 * Config loading utilities for sync CLI.
 *
 * Shared between main entry point and forks service.
 */

import { existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CellaCliConfig } from '../config/types';

/**
 * Load cella.config.ts from a fork/repo path.
 */
export async function loadConfig(forkPath: string): Promise<CellaCliConfig> {
  const configPath = join(forkPath, 'cella.config.ts');

  if (!existsSync(configPath)) {
    throw new Error(`config file not found: ${configPath}`);
  }

  // Resolve symlinks and validate path stays within fork directory
  const realConfigPath = realpathSync(configPath);
  const realForkPath = realpathSync(resolve(forkPath));
  if (!realConfigPath.startsWith(`${realForkPath}/`)) {
    throw new Error('config path resolves outside fork directory');
  }

  const configModule = await import(realConfigPath);
  return configModule.default;
}
