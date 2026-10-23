import { onlineManager, useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation for an imperative leave-entity flow tied to a confirmation dialog.
import { type ChannelBase, deleteMyMembership } from 'sdk';
import { appConfig } from 'shared';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { toaster, toastOffline } from '~/modules/common/toaster/toaster';
import { cacheRemove } from '~/query/basic/cache-mutations';
import { getEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { queryClient } from '~/query/query-client';
import { invalidateMemberships } from '~/query/realtime/membership-ops';

type LeaveChannelOptions = {
  /** Where to navigate after leaving; `null` stays put, for surfaces outside the channel itself. */
  redirectPath?: string | null;
  callback?: (args: CallbackArgs) => void;
};

export type LeaveChannelProps = LeaveChannelOptions & { channel: ChannelBase };

/**
 * Leaves a channel: removes it from the list cache and refreshes memberships, so the menu updates at once. `leave`
 * warns and does nothing while offline. For an app's own leave control; `LeaveChannelForm` renders the default one.
 * @public
 */
export function useLeaveChannel(channel: ChannelBase, { redirectPath = appConfig.defaultRedirectPath, callback }: LeaveChannelOptions = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const entityId = channel.id;
      return await deleteMyMembership({ query: { entityId, entityType: channel.entityType } });
    },
    onSuccess: () => {
      toaster.success(t('c:success.you_left_entity', { entity: channel.entityType }));
      if (redirectPath !== null) navigate({ to: redirectPath, replace: true });

      // Directly remove entity from list cache so menu updates immediately
      const keys = getEntityQueryKeys(channel.entityType);
      cacheRemove(keys.list.base, [channel]);
      queryClient.invalidateQueries({ queryKey: keys.detail.base });

      // Invalidate memberships so enrichment subscriber rebuilds menu
      invalidateMemberships();

      callback?.({ status: 'success' });
    },
  });

  const leave = () => {
    if (!onlineManager.isOnline()) {
      toastOffline();
      return;
    }
    mutate();
  };

  return { leave, isPending };
}
