import { CircleUserRound, Link, Pencil, Pickaxe, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { dateTwitterFormat } from '~/lib/utils';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import StickyBox from '~/modules/common/sticky-box';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import type { Task } from '~/types';

export const TaskHeader = ({
  task,
  isEditing,
  changeEditingState,
  closeExpand,
}: { task: Task; isEditing: boolean; changeEditingState: (state: boolean) => void; closeExpand: () => void }) => {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const isSubTask = task.parentId !== null;
  return (
    <StickyBox className="flex flex-row z-100 px-2 py-1 w-full justify-between border-b">
      <div className="flex flex-row sm: gap-1 gap-2 items-center">
        {!isSubTask && task.createdBy ? (
          <AvatarWrap type="user" id={task.createdBy.id} name={task.createdBy.name} url={task.createdBy.thumbnailUrl} className="h-6 w-6 text-xs" />
        ) : (
          <CircleUserRound size={16} />
        )}
        <span className="text-sm text-center">{dateTwitterFormat(task.createdAt, user.language, 'ago')}</span>
      </div>
      <div className="flex flex-row sm: gap-1 gap-2">
        <TooltipButton toolTipContent={t('common:edit')} side="bottom" sideOffset={5} hideWhenDetached>
          <Button
            onClick={() => changeEditingState(!isEditing)}
            aria-label="Edit"
            variant="ghost"
            className="flex flex-row items-center gap-1"
            size="xs"
          >
            {isEditing ? (
              <>
                {t('app:editing')}
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
          <TooltipButton toolTipContent={t('app:open_task_sheet')} side="bottom" sideOffset={5} hideWhenDetached>
            <Button
              onClick={() => {
                if (isEditing) changeEditingState(false);
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
              closeExpand();
              changeEditingState(false);
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
