import { Separator, select } from '@inquirer/prompts';
import pc from 'picocolors';
import { config } from '#/config';
import { getSyncServiceDescription, SYNC_SERVICES, SyncService } from '#/config/sync-services';

/**
 * Prompt the user to select a sync service.
 */
export async function promptSyncService(): Promise<SyncService> {
  // Generate options dynamically with config values
  const options = [
    { name: 'sync', value: SYNC_SERVICES.SYNC, description: getSyncServiceDescription(SYNC_SERVICES.SYNC, config) },
    { name: 'analyze', value: SYNC_SERVICES.ANALYZE, description: getSyncServiceDescription(SYNC_SERVICES.ANALYZE) },
    { name: 'validate', value: SYNC_SERVICES.VALIDATE, description: getSyncServiceDescription(SYNC_SERVICES.VALIDATE) },
  ];

  const syncService = await select<string>({
    message: 'select service to run:',
    choices: [...options, new Separator(), { name: pc.red('exit'), value: 'exit' }],
  });

  if (syncService === 'exit') {
    process.exit(1);
  }

  return syncService as SyncService;
}
