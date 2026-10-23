import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { SyncEnginePage } from '~/modules/marketing/sync-engine-page';
import { pageHead } from '~/utils/app-title';

/**
 * Dedicated page explaining Cella's sync engine.
 */
export const Route = createFileRoute('/_public/_marketing/sync-engine')({
  staticData: { isAuth: false },
  head: () => pageHead(i18n.t('c:sync_engine')),
  component: SyncEnginePage,
});
