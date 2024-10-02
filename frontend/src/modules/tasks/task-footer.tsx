import { useLocation } from '@tanstack/react-router';
import { ChevronDown, Tag, UserX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { updateTask } from '~/api/tasks';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { queryClient } from '~/lib/router';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { getNewStatusTaskOrder } from '~/modules/tasks/helpers';
import { handleTaskDropDownClick } from '~/modules/tasks/task-selectors/drop-down-trigger';
import { NotSelected } from '~/modules/tasks/task-selectors/impact-icons/not-selected';
import { impacts } from '~/modules/tasks/task-selectors/select-impact';
import { statusVariants, taskStatuses } from '~/modules/tasks/task-selectors/select-status';
import { AvatarGroup, AvatarGroupList, AvatarOverflowIndicator } from '~/modules/ui/avatar';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import type { Task } from '~/types/app';
import { cn } from '~/utils/utils';

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
      const query = queryClient.getQueryData<{ items: Task[] }>(['boardTasks', task.projectId]);
      const newOrder = getNewStatusTaskOrder(task.status, newStatus, isSheet ? (tasks ?? []) : (query?.items ?? []));
      const updatedTask = await updateTask(task.id, task.organizationId, 'status', newStatus, newOrder);
      const eventName = pathname.includes('/board') ? 'taskOperation' : 'taskTableOperation';
      dispatchCustomEvent(eventName, { array: [updatedTask], action: 'update', projectId: task.projectId });
    } catch (err) {
      toast.error(t('common:error.update_resource', { resource: t('app:task') }));
    }
  };
  return (
    <div className="flex flex-row items-center gap-1 pl-1">
      {!isSheet && (
        <Checkbox
          className="group-hover/task:opacity-100 border-foreground/40 data-[state=checked]:border-primary group-[.is-focused]/task:opacity-100 opacity-80"
          checked={isSelected}
          onCheckedChange={(checked) => dispatchCustomEvent('toggleSelectTask', { selected: !!checked, taskId: task.id })}
        />
      )}
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
            <div className="flex truncate flex-wrap gap-0.5 font-xs text-[.75rem] items-center">
              <Badge
                variant="outline"
                key={task.labels[0].id}
                className="inline-block bg-border px-2 max-w-24 h-5 border-0 last:mr-0 font-normal leading-4 truncate"
              >
                {task.labels[0].name}
              </Badge>
              {task.labels.length > 1 && (
                <Badge variant="outline" className="px-1 h-5 flex bg-border border-0 font-normal justify-center">
                  +{task.labels.length - 1}
                </Badge>
              )}
            </div>
          ) : (
            <div className="flex truncate flex-wrap gap-[.07rem]">
              {task.labels.map(({ name, id }) => {
                return (
                  <div key={id} className="flex flex-wrap max-w-24 align-center justify-center items-center rounded-full px-0">
                    <Badge
                      variant="outline"
                      key={id}
                      className="inline-block border-0 max-w-32 opacity-75 truncate font-normal text-[.75rem] h-5 bg-transparent last:mr-0 leading-4"
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
      <div className="flex gap-1 ml-auto">
        <Button
          id="assignedTo"
          onClick={(event) => handleTaskDropDownClick(task, 'assignedTo', event.currentTarget)}
          aria-label="Assign"
          variant="ghost"
          size="xs"
          className="relative flex justify-center gap-2 group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 px-1 min-w-8 opacity-80"
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
          disabled={task.status === 6}
          variant="outlineGhost"
          size="xs"
          className={cn(
            'relative border-r-0 rounded-r-none font-normal [&:not(.absolute)]:active:translate-y-0 disabled:opacity-100 mr-1',
            statusVariants({ status: task.status }),
          )}
        >
          {t(`app:${taskStatuses[task.status].action}`)}
        </Button>
        <Button
          onClick={(event) => handleTaskDropDownClick(task, `status-${task.id}`, event.currentTarget)}
          aria-label="Set status"
          variant="outlineGhost"
          size="xs"
          className={cn(
            'relative rounded-none rounded-r -ml-2 px-2 [&:not(.absolute)]:active:translate-y-0',
            statusVariants({ status: task.status }),
          )}
        >
          <ChevronDown size={12} className={`transition-transform ${isStatusDropdownOpen ? 'rotate-180' : 'rotate-0'}`} />
        </Button>
      </div>
    </div>
  );
};
