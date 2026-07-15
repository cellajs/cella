import { onlineManager, useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { UserRoundXIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation for an imperative leave-entity flow tied to a confirmation dialog.
import { type ChannelEntityBase, deleteMyMembership } from 'sdk';
import { appConfig } from 'shared';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button, type ButtonProps } from '~/modules/ui/button';
import { cacheRemove } from '~/query/basic/cache-mutations';
import { getEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { queryClient } from '~/query/query-client';
import { invalidateMemberships } from '~/query/realtime/membership-ops';
import { cn } from '~/utils/cn';

export type LeaveEntityButtonProps = {
  channelEntity: ChannelEntityBase;
  redirectPath?: string;
  buttonProps?: ButtonProps;
  callback?: (args: CallbackArgs) => void;
};

export const LeaveEntityButton = ({
  channelEntity,
  buttonProps,
  redirectPath = appConfig.defaultRedirectPath,
  callback,
}: LeaveEntityButtonProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { mutate: leaveEntity } = useMutation({
    mutationFn: async () => {
      const entityId = channelEntity.id;
      return await deleteMyMembership({ query: { entityId, entityType: channelEntity.entityType } });
    },
    onSuccess: () => {
      toaster(t('c:success.you_left_entity', { entity: channelEntity.entityType }), 'success');
      navigate({ to: redirectPath, replace: true });

      // Directly remove entity from list cache so menu updates immediately
      const keys = getEntityQueryKeys(channelEntity.entityType);
      cacheRemove(keys.list.base, [channelEntity]);
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
    leaveEntity();
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
