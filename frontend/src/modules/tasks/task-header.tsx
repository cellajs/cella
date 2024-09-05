import { Link, Pencil, Pickaxe, UserRound, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { dateVeryShort } from '~/lib/utils';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import StickyBox from '~/modules/common/sticky-box';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import type { Task } from '~/types';

export const TaskHeader = ({ task, isEditing }: { task: Task; isEditing: boolean }) => {
  const { t } = useTranslation();
  return (
    <StickyBox className="flex flex-row z-100 px-2 py-1  justify-between border-b">
      <div className="flex flex-row sm: gap-1 gap-2 items-center">
        {task.createdBy ? (
          <AvatarWrap type="user" id={task.createdBy.id} name={task.createdBy.name} url={task.createdBy.thumbnailUrl} className="h-6 w-6 text-xs" />
        ) : (
          <UserRound size={14} />
        )}
        <span className="text-sm text-center">{dateVeryShort(task.createdAt, 'ago')}</span>
      </div>
      <div className="flex flex-row sm: gap-1 gap-2">
        <TooltipButton toolTipContent={t('common:edit')} side="bottom" sideOffset={5} hideWhenDetached>
          <Button
            onClick={() => dispatchCustomEvent('toggleTaskEditing', { id: task.id, state: !isEditing })}
            aria-label="Edit"
            variant="ghost"
            className="flex flex-row items-center gap-1"
            size="xs"
          >
            {isEditing ? (
              <>
                {t('common:editing')}
                <Pickaxe size={14} className="animate-bounce" />
              </>
            ) : (
              <>
                {t('common:edit')}
                <Pencil size={12} />
              </>
            )}
          </Button>
        </TooltipButton>
        {!task.parentId && (
          <TooltipButton toolTipContent={t('common:open_task_sheet')} side="bottom" sideOffset={5} hideWhenDetached>
            <Button
              onClick={() => {
                if (isEditing) dispatchCustomEvent('toggleTaskEditing', { id: task.id, state: false });
                dispatchCustomEvent('openTaskCardPreview', task.id);
              }}
              aria-label="OpenTaskSheet"
              variant="ghost"
              size="xs"
              className="relative group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-80"
            >
              <Link size={12} />
            </Button>
          </TooltipButton>
        )}
        <TooltipButton toolTipContent={t('common:close')} side="bottom" sideOffset={5} hideWhenDetached>
          <Button
            onClick={() => {
              dispatchCustomEvent('toggleTaskEditing', { id: task.id, state: false });
              dispatchCustomEvent('toggleCard', task.id);
            }}
            aria-label="Collapse"
            variant="ghost"
            size="xs"
            className="relative group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-80"
          >
            <X size={14} />
          </Button>
        </TooltipButton>
      </div>
    </StickyBox>
  );
};
