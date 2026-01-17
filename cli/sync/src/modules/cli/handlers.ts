import pc from 'picocolors';
import { config } from '../../config';
import { SYNC_SERVICES, SyncService } from '../../config/sync-services';
import { SyncConfig } from '../../config/types';
import { logValidationWarnings, validateOverridesConfig } from '../../config/validate';
import { promptSyncService } from './prompts';
import { CLIConfig } from './types';

/**
 * Handle sync service selection.
 *
 * @param cli - The CLI configuration object
 */
export async function handleSyncService(cli: CLIConfig): Promise<void> {
  if (!cli.syncService) {
    if (cli.ci) {
      // In CI mode, default to analyze (safe, non-destructive)
      cli.syncService = SYNC_SERVICES.ANALYZE;
      config.syncService = SYNC_SERVICES.ANALYZE;
      console.info(`using sync service (CI default): ${pc.cyan(`${cli.syncService}\n`)}`);
    } else {
      cli.syncService = await promptSyncService();
      config.syncService = cli.syncService as SyncConfig['syncService'];
    }
  } else {
    console.info(`using sync service: ${pc.cyan(`${cli.syncService}\n`)}`);
  }
}

/**
 * Pass CLI configuration values to the main config on initial load.
 *
 * @param cliConfig - The CLI configuration object
 */
export function onInitialConfigLoad(cli: CLIConfig) {
  if (cli.syncService) {
    config.syncService = cli.syncService as SyncService;
  }

  if (cli.debug) {
    config.debug = cli.debug;
  }

  if (cli.skipPackages) {
    config.skipPackages = cli.skipPackages;
  }

  if (cli.upstreamLocation) {
    config.upstreamLocation = cli.upstreamLocation as 'local' | 'remote';
  }

  if (cli.upstreamBranch) {
    config.upstream = { branch: cli.upstreamBranch };
  }

  if (cli.forkLocation) {
    config.forkLocation = cli.forkLocation as 'local' | 'remote';
  }

  if (cli.forkBranch) {
    config.fork = { branch: cli.forkBranch };
  }

  if (cli.forkSyncBranch) {
    config.fork = { syncBranch: cli.forkSyncBranch };
  }
}

/**
 * Validates the overrides configuration and logs any warnings.
 * Called after config is loaded to catch invalid file patterns early.
 * @param strict - If true, exits with error code 1 when validation fails
 */
export async function validateConfig(strict = false): Promise<void> {
  const { valid, warnings } = await validateOverridesConfig(config.overrides, config.fork.workingDirectory);
  logValidationWarnings(warnings);

  if (strict && !valid) {
    console.error('❌ cella.config.ts contains invalid file paths');
    process.exit(1);
  }

  if (strict && valid) {
    console.log('✓ cella.config.ts overrides validated');
  }
}
