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

interface LeaveChannelOptions {
  /** Where to navigate after leaving; `null` stays on the page, for a control outside the channel's own pages. */
  redirectPath?: string | null;
  callback?: (args: CallbackArgs) => void;
}

export interface LeaveChannelProps extends LeaveChannelOptions {
  channel: ChannelBase;
}

/**
 * The leave mutation behind `LeaveChannelForm`, for an app's own leave control; offline, `leave` only warns.
 * @public
 */
export function useLeaveChannel(channel: ChannelBase, { redirectPath = appConfig.defaultRedirectPath, callback }: LeaveChannelOptions = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { mutate, isPending } = useMutation({
    mutationFn: () => deleteMyMembership({ query: { entityId: channel.id, entityType: channel.entityType } }),
    onSuccess: () => {
      toaster.success(t('c:success.leave_channel', { name: channel.name }));
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
    if (!onlineManager.isOnline()) return toastOffline();
    mutate();
  };

  return { leave, isPending };
}
