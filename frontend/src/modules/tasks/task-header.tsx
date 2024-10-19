import { ChevronUp, Maximize2, Trash } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import StickyBox from '~/modules/common/sticky-box';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { handleTaskDropDownClick, openTaskPreviewSheet } from '~/modules/tasks/helpers';
import { taskTypes } from '~/modules/tasks/task-dropdowns/select-task-type';
import { Button } from '~/modules/ui/button';
import type { Mode } from '~/store/theme';
import { useUserStore } from '~/store/user';
import type { Task } from '~/types/app';
import { dateMini } from '~/utils/date-mini';
import { dateShort } from '~/utils/date-short';
import TaskHeaderInfo from './task-header-info';
import type { TaskStates } from './types';

export const TaskHeader = ({
  task,
  state,
  isSheet,
  onRemove,
}: {
  task: Task;
  state: TaskStates;
  mode?: Mode;
  isSheet?: boolean;
  onRemove?: (subtaskId: string) => void;
}) => {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const [isHovered, setIsHovered] = useState(false);
  const [saveClicked, setSaveClicked] = useState(false);

  const isSubtask = task.parentId !== null;
  const isEditing = state === 'editing' || state === 'unsaved';

  const getButtonText = () => {
    if (isHovered && state === 'unsaved') return t('common:save');
    return isEditing ? t(`app:${state}`) : t('common:edit');
  };

  return (
    <StickyBox enabled={false} className="flex flex-row z-100 w-full justify-between">
      {!isSubtask && (
        <Button
          id={`type-${task.id}`}
          onClick={(event) => handleTaskDropDownClick(task, 'type', event.currentTarget)}
          aria-label="Set type"
          variant="ghost"
          size="xs"
          className=" relative group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-80 -ml-0.5"
        >
          {taskTypes[taskTypes.findIndex((t) => t.value === task.type)]?.icon() || ''}
        </Button>
      )}
      <div className="flex flex-row gap-1 w-full items-center ml-1">
        {!isSubtask && task.createdBy && (
          <>
            <AvatarWrap
              type="user"
              id={task.createdBy.id}
              name={task.createdBy.name}
              url={task.createdBy.thumbnailUrl}
              className="max-sm:hidden h-5 w-5 text-xs"
            />
            <TooltipButton toolTipContent={dateShort(task.createdAt)} side="bottom" sideOffset={5} hideWhenDetached>
              <span className="ml-1 opacity-50 text-sm text-center font-light">{dateMini(task.createdAt, user.language, 'ago')}</span>
            </TooltipButton>
            <TaskHeaderInfo task={task} />
          </>
        )}

        <div className="grow" />
        {(!isSheet || isSubtask) && (
          <TooltipButton
            disabled={isEditing}
            toolTipContent={t('common:edit_resource', { resource: isSubtask ? t('app:todo').toLowerCase() : t('app:task').toLowerCase() })}
            side="bottom"
            sideOffset={5}
            hideWhenDetached
          >
            <Button
              id={`edit-toggle-${task.id}`}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              onMouseDown={() => {
                if (state !== 'unsaved') return;
                setSaveClicked(true);
                setTimeout(() => setSaveClicked(false), 2000);
              }}
              onClick={() => {
                const event = isSubtask ? 'changeSubtaskState' : 'changeTaskState';
                dispatchCustomEvent(event, { taskId: task.id, state: isEditing ? 'expanded' : 'editing' });
              }}
              aria-label="Edit"
              variant="ghost"
              className={`flex  min-w-20 flex-row items-center gap-1 font-light ${state === 'unsaved' ? 'hover:text-green-500' : ''}`}
              size="xs"
            >
              <span className={`${isEditing ? 'italic' : ''} ${saveClicked ? 'text-green-500' : ''}`}>
                {saveClicked ? t('common:saved') : getButtonText()}
              </span>
            </Button>
          </TooltipButton>
        )}

        {!isSubtask && !isSheet && (
          <TooltipButton toolTipContent={t('common:expand')} side="bottom" sideOffset={5} hideWhenDetached>
            <Button onClick={() => openTaskPreviewSheet(task)} aria-label="OpenTaskSheet" variant="ghost" size="xs" className="w-8 h-8">
              <Maximize2 size={14} />
            </Button>
          </TooltipButton>
        )}

        {isSubtask && onRemove && (
          <TooltipButton toolTipContent={t('common:delete')} side="bottom" sideOffset={5} hideWhenDetached>
            <Button onClick={() => onRemove(task.id)} variant="ghost" size="xs" className="text-secondary-foreground cursor-pointer">
              <span className="sr-only">{t('app:move_task')}</span>
              <Trash size={14} />
            </Button>
          </TooltipButton>
        )}

        {(!isSheet || isSubtask) && (
          <TooltipButton toolTipContent={t('common:close')} side="bottom" sideOffset={5} hideWhenDetached>
            <Button
              onClick={() => {
                const event = isSubtask ? 'changeSubtaskState' : 'changeTaskState';
                dispatchCustomEvent(event, { taskId: task.id, state: 'folded' });
              }}
              aria-label="Collapse"
              variant="ghost"
              size="xs"
              className="w-8 h-8"
            >
              <ChevronUp size={14} />
            </Button>
          </TooltipButton>
        )}
      </div>
    </StickyBox>
  );
};
