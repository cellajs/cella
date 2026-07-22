import { onlineManager, useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { UserRoundXIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation for an imperative leave-entity flow tied to a confirmation dialog.
import { type ChannelBase, deleteMyMembership } from 'sdk';
import { appConfig } from 'shared';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button, type ButtonProps } from '~/modules/ui/button';
import { cacheRemove } from '~/query/basic/cache-mutations';
import { getEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { queryClient } from '~/query/query-client';
import { invalidateMemberships } from '~/query/realtime/membership-ops';
import { cn } from '~/utils/cn';

export type LeaveChannelButtonProps = {
  channel: ChannelBase;
  redirectPath?: string;
  buttonProps?: ButtonProps;
  callback?: (args: CallbackArgs) => void;
};

export const LeaveChannelButton = ({
  channel,
  buttonProps,
  redirectPath = appConfig.defaultRedirectPath,
  callback,
}: LeaveChannelButtonProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { mutate: leaveChannel } = useMutation({
    mutationFn: async () => {
      const entityId = channel.id;
      return await deleteMyMembership({ query: { entityId, entityType: channel.entityType } });
    },
    onSuccess: () => {
      toaster(t('c:success.you_left_entity', { entity: channel.entityType }), 'success');
      navigate({ to: redirectPath, replace: true });

      // Directly remove entity from list cache so menu updates immediately
      const keys = getEntityQueryKeys(channel.entityType);
      cacheRemove(keys.list.base, [channel]);
      queryClient.invalidateQueries({ queryKey: keys.detail.base });

      // Invalidate memberships so enrichment subscriber rebuilds menu
      invalidateMemberships();

      callback?.({ status: 'success' });
    },
  });

  const handleLeave = () => {
    if (!onlineManager.isOnline()) {
      toaster(t('c:action.offline.text'), 'warning');
      return;
    }
    leaveChannel();
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLButtonElement> = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    handleLeave();
  };

  return (
    <Button
      onClick={handleLeave}
      onKeyDown={handleKeyDown}
      {...buttonProps}
      className={cn('flex w-full items-center justify-start gap-2 rounded-md', buttonProps?.className)}
      aria-label="Leave"
    >
      <UserRoundXIcon />
      <span className="ml-1">{t('c:leave')}</span>
    </Button>
  );
};
