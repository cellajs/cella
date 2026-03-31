import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import { useAlertStore } from '~/modules/common/alerter/alert-store';
import { useDraftStore } from '~/modules/common/form-draft/draft-store';
import type { MeUser } from '~/modules/me/types';
import { useSeenStore } from '~/modules/seen/seen-store';
import { useUIStore } from '~/modules/ui/ui-store';
import { useUserStore } from '~/modules/user/user-store';
import { persister, sessionPersister } from '~/query/persister';
import { queryClient } from '~/query/query-client';

/**
 * Flushes sensitive stores and resets the application state.
 * For account removal, it clears all data and resets UI state.
 *
 * @param {boolean} [removeAccount=false] - Whether to remove the user account.
 */
export const flushStores = (removeAccount?: boolean) => {
  queryClient.clear();
  sessionPersister.removeClient();
  persister.removeClient();
  useSeenStore.getState().clear();
  useUserStore.setState({ user: null as unknown as MeUser });
  useDraftStore.getState().clearForms();
  useUIStore.getState().setImpersonating(false);

  // Clear attachment blobs and download queue from IDB
  attachmentStorage.clearAll();

  if (!removeAccount) return;
  // Clear below on remove account
  useAlertStore.getState().clearAlertStore();
  useUIStore.getState().clearUIStore();
  useUserStore.setState({ lastUser: null as unknown as MeUser });
};
