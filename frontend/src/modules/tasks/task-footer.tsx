import { useLocation } from '@tanstack/react-router';
import { ChevronDown, Tag, UserX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { updateTask } from '~/api/tasks';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { queryClient } from '~/lib/router';
import { cn } from '~/lib/utils';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { handleTaskDropDownClick } from '~/modules/common/dropdowner';
import { getNewStatusTaskOrder } from '~/modules/tasks/helpers';
import { NotSelected } from '~/modules/tasks/task-selectors/impact-icons/not-selected';
import { impacts } from '~/modules/tasks/task-selectors/select-impact';
import { type TaskStatus, statusVariants, taskStatuses } from '~/modules/tasks/task-selectors/select-status';
import { taskTypes } from '~/modules/tasks/task-selectors/select-task-type';
import { AvatarGroup, AvatarGroupList, AvatarOverflowIndicator } from '~/modules/ui/avatar';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import type { Task } from '~/types';

interface TasksFooterProps {
  task: Task;
  isSelected: boolean;
  tasks?: Task[];
  isSheet?: boolean;
  isStatusDropdownOpen: boolean;
}

export const TaskFooter = ({ task, isSelected, isStatusDropdownOpen, tasks, isSheet = false }: TasksFooterProps) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isMobile = useBreakpoints('max', 'sm');

  const selectedImpact = task.impact !== null ? impacts[task.impact] : null;

  const updateStatus = async (newStatus: number) => {
    try {
      const query = queryClient.getQueryData(['boardTasks', task.projectId]) as { items: Task[] };
      const newOrder = getNewStatusTaskOrder(task.status, newStatus, isSheet ? tasks ?? [] : query.items ?? []);
      const updatedTask = await updateTask(task.id, 'status', newStatus, newOrder);
      const eventName = pathname.includes('/board') ? 'taskCRUD' : 'taskTableCRUD';
      dispatchCustomEvent(eventName, { array: [updatedTask], action: 'update', projectId: task.projectId });
    } catch (err) {
      toast.error(t('common:error.update_resource', { resource: t('app:task') }));
    }
  };
  return (
    <div className="flex flex-row items-center gap-1 pl-2 ">
      {!isSheet && (
        <Checkbox
          className="group-hover/task:opacity-100 border-foreground/40 data-[state=checked]:border-primary group-[.is-focused]/task:opacity-100 opacity-80"
          checked={isSelected}
          onCheckedChange={(checked) => dispatchCustomEvent('toggleSelectTask', { selected: !!checked, taskId: task.id })}
        />
      )}
      <Button
        id="type"
        onClick={(event) => handleTaskDropDownClick(task, 'type', event.currentTarget)}
        aria-label="Set type"
        variant="ghost"
        size="xs"
        className="relative group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-80"
      >
        {taskTypes[taskTypes.findIndex((t) => t.value === task.type)]?.icon() || ''}
      </Button>
      {task.type !== 'bug' && (
        <Button
          id="impact"
          onClick={(event) => handleTaskDropDownClick(task, 'impact', event.currentTarget)}
          aria-label="Set impact"
          variant="ghost"
          size="xs"
          className="relative group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-80"
        >
          {selectedImpact === null ? (
            <NotSelected className="size-4 fill-current" aria-hidden="true" />
          ) : (
            <selectedImpact.icon className="size-4 fill-current" aria-hidden="true" />
          )}
        </Button>
      )}

      <Button
        id="labels"
        onClick={(event) => handleTaskDropDownClick(task, 'labels', event.currentTarget)}
        aria-label="Set labels"
        variant="ghost"
        size="xs"
        className="relative flex h-auto font-light sm: px-0.5 py-0.5 min-h-8 min-w-8 group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-80"
      >
        {task.labels.length > 0 ? (
          isMobile ? (
            <div className="inline-flex gap-0.5 items-center">
              <Badge
                variant="outline"
                key={task.labels[0].id}
                className="inline-block border-0 px-0 truncate font-xs text-[.75rem] h-5 bg-transparent last:mr-0 leading-4"
              >
                {task.labels[0].name}
              </Badge>
              <Badge className="p-1 min-w-5 min-h-5 flex bg-accent justify-center">+{task.labels.length - 1}</Badge>
            </div>
          ) : (
            <div className="flex truncate flex-wrap gap-[.07rem]">
              {task.labels.map(({ name, id }) => {
                return (
                  <div key={id} className="flex flex-wrap max-w-24 align-center justify-center items-center rounded-full border px-0 bg-border">
                    <Badge
                      variant="outline"
                      key={id}
                      className="inline-block border-0 max-w-32 truncate font-normal text-[.75rem] h-5 bg-transparent last:mr-0 leading-4"
                    >
                      {name}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <Tag size={16} className="opacity-60" />
        )}
      </Button>
      <div className="flex gap-1 ml-auto mr-1">
        <Button
          id="assignedTo"
          onClick={(event) => handleTaskDropDownClick(task, 'assignedTo', event.currentTarget)}
          aria-label="Assign"
          variant="ghost"
          size="xs"
          className="relative flex justify-start gap-2 group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-80"
        >
          {task.assignedTo.length > 0 ? (
            <AvatarGroup limit={isMobile ? 1 : 3}>
              <AvatarGroupList>
                {task.assignedTo.map((user) => (
                  <AvatarWrap type="user" key={user.id} id={user.id} name={user.name} url={user.thumbnailUrl} className="h-6 w-6 text-xs" />
                ))}
              </AvatarGroupList>
              <AvatarOverflowIndicator className="h-6 w-6 text-xs" />
            </AvatarGroup>
          ) : (
            <UserX className="h-4 w-4 opacity-60" />
          )}
        </Button>

        <Button
          id={`status-${task.id}`}
          onClick={() => updateStatus(task.status + 1)}
          disabled={(task.status as TaskStatus) === 6}
          variant="outlineGhost"
          size="xs"
          className={cn(
            'relative border-r-0 rounded-r-none font-normal [&:not(.absolute)]:active:translate-y-0 disabled:opacity-100 mr-1',
            statusVariants({ status: task.status as TaskStatus }),
          )}
        >
          {t(`app:${taskStatuses[task.status as TaskStatus].action}`)}
        </Button>
        <Button
          onClick={(event) => handleTaskDropDownClick(task, `status-${task.id}`, event.currentTarget)}
          aria-label="Set status"
          variant="outlineGhost"
          size="xs"
          className={cn(
            'relative rounded-none rounded-r -ml-2 [&:not(.absolute)]:active:translate-y-0',
            statusVariants({ status: task.status as TaskStatus }),
          )}
        >
          <ChevronDown size={12} className={`transition-transform ${isStatusDropdownOpen ? 'rotate-180' : 'rotate-0'}`} />
        </Button>
      </div>
    </div>
  );
};
