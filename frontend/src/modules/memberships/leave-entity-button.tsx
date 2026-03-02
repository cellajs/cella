import { onlineManager, useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { UserRoundXIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { type ContextEntityBase, deleteMyMembership } from '~/api.gen';
import { CallbackArgs } from '~/modules/common/data-table/types';
import { toaster } from '~/modules/common/toaster/service';
import { Button, type ButtonProps } from '~/modules/ui/button';
import { queryClient } from '~/query/query-client';
import { cn } from '~/utils/cn';

export type LeaveEntityButtonProps = {
  contextEntity: ContextEntityBase;
  redirectPath?: string;
  buttonProps?: ButtonProps;
  callback?: (args: CallbackArgs) => void;
};

export const LeaveEntityButton = ({
  contextEntity,
  buttonProps,
  redirectPath = appConfig.defaultRedirectPath,
  callback,
}: LeaveEntityButtonProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { mutate: leaveEntity } = useMutation({
    mutationFn: async () => {
      const entityId = contextEntity.id;
      return await deleteMyMembership({ query: { entityId, entityType: contextEntity.entityType } });
    },
    onSuccess: () => {
      toaster(t('common:success.you_left_entity', { entity: contextEntity.entityType }), 'success');
      navigate({ to: redirectPath, replace: true });

      // Clear related cache entries
      // Note: works if queryKeys are structured like `organizationQueryKeys.single`
      queryClient.removeQueries({
        predicate: ({ queryKey }) =>
          queryKey.includes(contextEntity.entityType) &&
          queryKey.some((k) => k === contextEntity.id || k === contextEntity.slug),
      });

      callback?.({ status: 'success' });
    },
  });

  const handleLeave = () => {
    if (!onlineManager.isOnline()) {
      toaster(t('common:action.offline.text'), 'warning');
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
      className={cn('flex justify-start gap-2 items-center w-full rounded-md', buttonProps?.className)}
      aria-label="Leave"
    >
      <UserRoundXIcon size={16} />
      <span className="ml-1">{t('common:leave')}</span>
    </Button>
  );
};
