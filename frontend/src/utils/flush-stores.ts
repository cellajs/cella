import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import { useAlertStore } from '~/modules/common/alerter/alert-store';
import { useDraftStore } from '~/modules/common/form-draft/draft-store';
import type { MeUser } from '~/modules/me/types';
import { useSeenStore } from '~/modules/seen/seen-store';
import { useUIStore } from '~/modules/ui/ui-store';
import { useUserStore } from '~/modules/user/user-store';
import { deleteAppDb } from '~/query/app-db';
import { persister, sessionPersister } from '~/query/persister';
import { queryClient } from '~/query/query-client';

/**
 * Flush per-user client state on sign-out (and optionally wipe everything on account removal).
 *
 * Cross-user isolation is structural: all per-user data lives in one IndexedDB named for the
 * owner (`~/query/app-db`), whose lifecycle is auth-driven (`~/query/app-storage`). Nulling the
 * user below closes (unbinds) that DB automatically; account removal additionally deletes it.
 *
 * Order matters — the persister/attachment/queue writes must run while the appdb is still bound
 * (i.e. before the user is nulled). Fire-and-forget at call sites; awaiting is optional.
 *
 * @param removeAccount - When true, permanently delete the user's appdb and reset UI state.
 */
export const flushStores = async (removeAccount?: boolean): Promise<void> => {
  queryClient.clear();

  // Clear persisted query cache + queued mutations and attachment blobs while the appdb is bound.
  await Promise.all([sessionPersister.removeClient(), persister.removeClient(), attachmentStorage.clearAll()]);

  useSeenStore.getState().clear();
  useDraftStore.getState().clearForms();
  useUIStore.getState().setImpersonating(false);

  if (removeAccount) {
    useAlertStore.getState().clearAlertStore();
    useUIStore.getState().clearUIStore();
    // Permanently delete this user's appdb before we forget who they are.
    await deleteAppDb();
  }

  // Nulling the user triggers the auth-driven appdb lifecycle to close (unbind) the DB.
  useUserStore.setState({ user: null as unknown as MeUser });
  if (removeAccount) useUserStore.setState({ lastUser: null });
};
