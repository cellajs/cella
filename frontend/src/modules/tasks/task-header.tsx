import { Link, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { dateTwitterFormat } from '~/lib/utils';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import StickyBox from '~/modules/common/sticky-box';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { handleTaskDropDownClick } from '~/modules/tasks/task-selectors/drop-down-trigger';
import { taskTypes } from '~/modules/tasks/task-selectors/select-task-type';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import type { Task } from '~/types/app';

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
    <StickyBox enabled={false} className="flex flex-row z-100 w-full justify-between">
      <div className="flex flex-row gap-1 w-full items-center">
        {!isSubTask && task.createdBy && (
          <>
            <Button
              id="type"
              onClick={(event) => handleTaskDropDownClick(task, 'type', event.currentTarget)}
              aria-label="Set type"
              variant="ghost"
              size="xs"
              className="relative group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-80 -ml-0.5"
            >
              {taskTypes[taskTypes.findIndex((t) => t.value === task.type)]?.icon() || ''}
            </Button>
            <AvatarWrap type="user" id={task.createdBy.id} name={task.createdBy.name} url={task.createdBy.thumbnailUrl} className="h-6 w-6 text-xs" />
            <span className="ml-1 opacity-50 text-sm text-center font-light">{dateTwitterFormat(task.createdAt, user.language, 'ago')}</span>
          </>
        )}
        <div className="grow" />

        <TooltipButton
          disabled={isEditing}
          toolTipContent={t('common:edit_resource', { resource: t('app:task').toLowerCase() })}
          side="bottom"
          sideOffset={5}
          hideWhenDetached
        >
          <Button
            onClick={() => changeEditingState(!isEditing)}
            aria-label="Edit"
            variant="ghost"
            className="flex flex-row items-center gap-1 font-light"
            size="xs"
          >
            {isEditing ? <span className="italic">{t('app:editing')}</span> : t('common:edit')}
          </Button>
        </TooltipButton>

        {!task.parentId && (
          <TooltipButton toolTipContent={t('common:expand')} side="bottom" sideOffset={5} hideWhenDetached>
            <Button
              onClick={() => {
                if (isEditing) changeEditingState(false);
                dispatchCustomEvent('openTaskCardPreview', task.id);
              }}
              aria-label="OpenTaskSheet"
              variant="ghost"
              size="xs"
              className="w-8 h-8"
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
            className="w-8 h-8"
          >
            <X size={14} />
          </Button>
        </TooltipButton>
      </div>
    </StickyBox>
  );
};
