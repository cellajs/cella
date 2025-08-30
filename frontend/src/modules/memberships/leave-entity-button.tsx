import { onlineManager, useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { appConfig } from 'config';
import { UserRoundX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type ContextEntityBaseSchema, deleteMyMembership } from '~/api.gen';
import { toaster } from '~/modules/common/toaster/service';
import { deleteMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
import { Button, type ButtonProps } from '~/modules/ui/button';
import { queryClient } from '~/query/query-client';
import { cn } from '~/utils/cn';

export type LeaveEntityButtonProps = { entity: ContextEntityBaseSchema; redirectPath?: string; buttonProps?: ButtonProps; callback?: () => void };

export const LeaveEntityButton = ({ entity, buttonProps, redirectPath = appConfig.defaultRedirectPath, callback }: LeaveEntityButtonProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { mutate: leaveEntity } = useMutation({
    mutationFn: async () => {
      const idOrSlug = entity.id;
      return await deleteMyMembership({ query: { idOrSlug, entityType: entity.entityType } });
    },
    onSuccess: () => {
      toaster(t('common:success.you_left_entity', { entity: entity.entityType }), 'success');
      navigate({ to: redirectPath, replace: true });

      // Clear related cache entries
      // Note: works if queryKeys are structured like `organizationsKeys.single`
      queryClient.removeQueries({
        predicate: ({ queryKey }) => queryKey.includes(entity.entityType) && queryKey.some((k) => k === entity.id || k === entity.slug),
      });

      deleteMenuItem(entity.id);
      callback?.();
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
      <UserRoundX size={16} />
      <span className="ml-1">{t('common:leave')}</span>
    </Button>
  );
};
