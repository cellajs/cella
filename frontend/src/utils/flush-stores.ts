import type { MeUser } from '~/modules/me/types';
import { queryClient } from '~/query/query-client';
import { useAlertStore } from '~/store/alert';
import { useDraftStore } from '~/store/draft';
import { useNavigationStore } from '~/store/navigation';
import { useSyncStore } from '~/store/sync';
import { useUIStore } from '~/store/ui';
import { useUserStore } from '~/store/user';

/**
 * Flushes sensitive stores and resets the application state.
 * For account removal, it clears all data and resets UI state.
 *
 * @param {boolean} [removeAccount=false] - Whether to remove the user account.
 */
export const flushStores = (removeAccount?: boolean) => {
  queryClient.clear();
  useUserStore.setState({ user: null as unknown as MeUser });
  useSyncStore.setState({ data: {} });
  useDraftStore.getState().clearForms();
  useNavigationStore.getState().clearNavigationStore();
  useUIStore.getState().setImpersonating(false);

  if (!removeAccount) return;
  // Clear below on remove account
  useAlertStore.getState().clearAlertStore();
  useUIStore.getState().clearUIStore();
  useUserStore.setState({ lastUser: null as unknown as MeUser, hasPasskey: false, enabledOAuth: [] });
};
