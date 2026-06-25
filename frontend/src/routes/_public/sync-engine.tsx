import { createFileRoute } from '@tanstack/react-router';
import { SyncEnginePage } from '~/modules/marketing/sync-engine-page';
import appTitle from '~/utils/app-title';

/**
 * Dedicated page explaining Cella's sync engine.
 */
export const Route = createFileRoute('/_public/sync-engine')({
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Sync engine') }] }),
  component: SyncEnginePage,
});
