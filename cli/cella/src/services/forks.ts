/**
 * Forks service for sync CLI v2.
 *
 * Allows syncing to multiple local fork repositories from an upstream template.
 * Lists configured forks and runs sync against the selected fork.
 */

import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { select } from '@inquirer/prompts';
import pc from 'picocolors';
import type { CellaCliConfig, ForkConfig, RuntimeConfig, SyncService } from '../config/types';
import { getCurrentBranch, isClean } from '../utils/git';

/**
 * Load cella.config.ts from a fork path.
 */
async function loadForkConfig(forkPath: string): Promise<CellaCliConfig> {
  const configPath = `${forkPath}/cella.config.ts`;

  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const configModule = await import(configPath);
  return configModule.default;
}

/**
 * Validate a fork path exists and is a git repository.
 */
function validateForkPath(
  fork: ForkConfig,
  basePath: string,
): { valid: boolean; resolvedPath: string; error?: string } {
  const resolvedPath = resolve(basePath, fork.path);

  if (!existsSync(resolvedPath)) {
    return { valid: false, resolvedPath, error: 'path does not exist' };
  }

  if (!existsSync(`${resolvedPath}/.git`)) {
    return { valid: false, resolvedPath, error: 'not a git repository' };
  }

  if (!existsSync(`${resolvedPath}/cella.config.ts`)) {
    return { valid: false, resolvedPath, error: 'missing cella.config.ts' };
  }

  return { valid: true, resolvedPath };
}

/**
 * Run preflight checks for the selected fork.
 */
async function preflightFork(forkPath: string, forkBranch: string): Promise<void> {
  const currentBranch = await getCurrentBranch(forkPath);
  if (currentBranch !== forkBranch) {
    throw new Error(`Fork must be on branch '${forkBranch}'. Currently on '${currentBranch}'.`);
  }

  const clean = await isClean(forkPath);
  if (!clean) {
    throw new Error('Fork has uncommitted changes. Please commit or stash before syncing.');
  }
}

/**
 * Run the forks service.
 *
 * Lists configured forks, lets user select one, then runs sync against it.
 */
export async function runForks(config: RuntimeConfig): Promise<void> {
  const forks = config.forks ?? [];

  if (forks.length === 0) {
    console.info(pc.yellow('No forks configured in cella.config.ts'));
    console.info(pc.dim('Add forks to your config:'));
    console.info(pc.dim(`  forks: [{ name: 'my-app', path: '../my-app' }]`));
    return;
  }

  // Build choices with validation status
  const choices: Array<{ value: string; name: string; disabled?: string }> = [];

  for (const fork of forks) {
    const validation = validateForkPath(fork, config.forkPath);

    if (validation.valid) {
      choices.push({
        value: fork.path,
        name: `${fork.name}  ${pc.dim(fork.path)}`,
      });
    } else {
      choices.push({
        value: fork.path,
        name: `${fork.name}  ${pc.dim(fork.path)}`,
        disabled: validation.error,
      });
    }
  }

  // Add back/exit option
  choices.push(
    { value: '_separator', name: '─'.repeat(40), disabled: ' ' },
    { value: '_back', name: pc.dim('← back to main menu') },
  );

  // Prompt for fork selection
  const selectedPath = await select<string>({
    message: 'select fork to sync:',
    choices,
  });

  if (selectedPath === '_back' || selectedPath === '_separator') {
    return;
  }

  const resolvedForkPath = resolve(config.forkPath, selectedPath);
  const forkName = forks.find((f) => f.path === selectedPath)?.name ?? basename(resolvedForkPath);

  console.info();
  console.info(pc.cyan(`Syncing to ${forkName}...`));
  console.info(pc.dim(`Path: ${resolvedForkPath}`));
  console.info();

  // Load the fork's config
  const forkConfig = await loadForkConfig(resolvedForkPath);

  // Prompt for which service to run on the fork
  const service = await select<SyncService | 'back'>({
    message: `select service for ${forkName}:`,
    choices: [
      { value: 'analyze' as SyncService, name: `analyze    ${pc.dim('dry run to see what would change')}` },
      { value: 'sync' as SyncService, name: `sync       ${pc.dim('merge upstream changes')}` },
      { value: 'packages' as SyncService, name: `packages   ${pc.dim('sync package.json keys')}` },
      { value: '_separator', name: '─'.repeat(40), disabled: ' ' } as unknown as { value: 'back'; name: string },
      { value: 'back', name: pc.dim('← back to fork selection') },
    ],
  });

  if (service === 'back' || service === ('_separator' as SyncService)) {
    // Recursively show fork selection again
    return runForks(config);
  }

  // Run preflight for non-analyze services
  if (service !== 'analyze') {
    await preflightFork(resolvedForkPath, forkConfig.settings.forkBranch);
  }

  // Build runtime config for the fork
  const remoteName = forkConfig.settings.upstreamRemoteName || 'cella-upstream';
  const upstreamRef = `${remoteName}/${forkConfig.settings.upstreamBranch}`;

  const forkRuntimeConfig: RuntimeConfig = {
    ...forkConfig,
    forkPath: resolvedForkPath,
    upstreamRef,
    service,
    logFile: config.logFile,
    list: false,
    verbose: config.verbose,
  };

  // Dynamically import and run the appropriate service
  switch (service) {
    case 'analyze': {
      const { runAnalyze } = await import('./analyze');
      await runAnalyze(forkRuntimeConfig);
      break;
    }
    case 'sync': {
      const { runSync } = await import('./sync');
      await runSync(forkRuntimeConfig);
      break;
    }
    case 'packages': {
      const { runPackages } = await import('./packages');
      await runPackages(forkRuntimeConfig);
      break;
    }
  }
}
