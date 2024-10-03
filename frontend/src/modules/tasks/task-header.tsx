import { config } from 'config';
import { motion } from 'framer-motion';
import { ChevronUp, Maximize2, Trash } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import StickyBox from '~/modules/common/sticky-box';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { handleTaskDropDownClick } from '~/modules/tasks/task-selectors/drop-down-trigger';
import { taskTypes } from '~/modules/tasks/task-selectors/select-task-type';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import type { Task } from '~/types/app';
import { dateMini } from '~/utils/date-mini';
import { dateShort } from '~/utils/date-short';
import HeaderInfo from './header-info';
import type { TaskStates } from './types';

export const TaskHeader = ({
  task,
  state,
  isSheet,
  onRemove,
}: {
  task: Task;
  state: TaskStates;
  isSheet?: boolean;
  onRemove?: (subTaskId: string) => void;
}) => {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const [isHovered, setIsHovered] = useState(false);
  const isSubTask = task.parentId !== null;
  const isEditing = state === 'editing' || state === 'unsaved';

  const getButtonText = () => {
    if (isHovered && state === 'unsaved') return t('common:save');
    return isEditing ? t(`app:${state}`) : t('common:edit');
  };

  return (
    <StickyBox enabled={false} className="flex flex-row z-100 w-full justify-between">
      {!isSubTask && task.createdBy && (
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
      )}
      <motion.div
        className="flex flex-row gap-1 w-full items-center ml-1"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
      >
        {!isSubTask && task.createdBy && (
          <>
            <AvatarWrap type="user" id={task.createdBy.id} name={task.createdBy.name} url={task.createdBy.thumbnailUrl} className="h-6 w-6 text-xs" />
            <TooltipButton toolTipContent={dateShort(task.createdAt)} side="bottom" sideOffset={5} hideWhenDetached>
              <span className="ml-1 opacity-50 text-sm text-center font-light">{dateMini(task.createdAt, user.language, 'ago')}</span>
            </TooltipButton>
            <HeaderInfo task={task} />
            {/*  in development: show subtask order number to debug drag */}
            {config.mode === 'development' && isSubTask && <span className="ml-1 opacity-50 text-sm text-center font-light">{task.order}</span>}
          </>
        )}

        <div className="grow" />
        {(!isSheet || isSubTask) && (
          <TooltipButton
            disabled={isEditing}
            toolTipContent={t('common:edit_resource', { resource: isSubTask ? t('app:todo').toLowerCase() : t('app:task').toLowerCase() })}
            side="bottom"
            sideOffset={5}
            hideWhenDetached
          >
            <Button
              id="edit-toggle"
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              onClick={() => {
                const event = isSubTask ? 'changeSubTaskState' : 'changeTaskState';
                dispatchCustomEvent(event, { taskId: task.id, state: isEditing ? 'expanded' : 'editing' });
              }}
              aria-label="Edit"
              variant="ghost"
              className={`flex  min-w-20 flex-row items-center gap-1 font-light ${state === 'unsaved' ? 'hover:text-green-500' : ''}`}
              size="xs"
            >
              <span className={isEditing ? 'italic' : ''}>{getButtonText()}</span>
            </Button>
          </TooltipButton>
        )}

        {!isSubTask && !isSheet && (
          <TooltipButton toolTipContent={t('common:expand')} side="bottom" sideOffset={5} hideWhenDetached>
            <Button
              onClick={() => {
                if (isEditing) dispatchCustomEvent('changeTaskState', { taskId: task.id, state: 'expanded' });
                dispatchCustomEvent('openTaskCardPreview', task.id);
              }}
              aria-label="OpenTaskSheet"
              variant="ghost"
              size="xs"
              className="w-8 h-8"
            >
              <Maximize2 size={14} />
            </Button>
          </TooltipButton>
        )}

        {isSubTask && onRemove && (
          <TooltipButton toolTipContent={t('common:delete')} side="bottom" sideOffset={5} hideWhenDetached>
            <Button onClick={() => onRemove(task.id)} variant="ghost" size="xs" className="text-secondary-foreground cursor-pointer">
              <span className="sr-only">{t('app:move_task')}</span>
              <Trash size={14} />
            </Button>
          </TooltipButton>
        )}

        {(!isSheet || isSubTask) && (
          <TooltipButton toolTipContent={t('common:close')} side="bottom" sideOffset={5} hideWhenDetached>
            <Button
              onClick={() => {
                const event = isSubTask ? 'changeSubTaskState' : 'changeTaskState';
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
      </motion.div>
    </StickyBox>
  );
};
