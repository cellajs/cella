import { Separator, select } from '@inquirer/prompts';
import pc from 'picocolors';
import { SYNC_SERVICE_OPTIONS, SyncService } from '../../config/sync-services';

/**
 * Prompt the user to select a sync service.
 */
export async function promptSyncService(): Promise<SyncService> {
  const syncService = await select<string>({
    message: 'select service to run:',
    choices: [...SYNC_SERVICE_OPTIONS, new Separator(), { name: pc.red('exit'), value: 'exit' }],
  });

  if (syncService === 'exit') {
    process.exit(1);
  }

  return syncService as SyncService;
}
