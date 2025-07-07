import { onlineManager, useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { UserRoundX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { deleteMyMembership } from '~/api.gen';
import { toaster } from '~/modules/common/toaster';
import type { EntitySummary } from '~/modules/entities/types';
import { deleteMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
import { Button, type ButtonProps } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

export type LeaveEntityButtonProps = { entity: EntitySummary; redirectPath?: string; buttonProps?: ButtonProps; callback?: () => void };

export const LeaveEntityButton = ({ entity, buttonProps, redirectPath = config.defaultRedirectPath, callback }: LeaveEntityButtonProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // TODO the code is not isomorphic, shouldn't it also clear cache for this organization?
  const { mutate: leaveEntity } = useMutation({
    mutationFn: async () => {
      const idOrSlug = entity.id;
      return await deleteMyMembership({ query: { idOrSlug, entityType: entity.entityType } });
    },
    onSuccess: () => {
      toaster(t('common:success.you_left_entity', { entity: entity.entityType }), 'success');
      navigate({ to: redirectPath, replace: true });
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
