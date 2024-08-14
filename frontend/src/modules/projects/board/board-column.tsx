import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { ChevronDown, Palmtree, Search, Undo } from 'lucide-react';
import { lazy, useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useTaskFilters from '~/hooks/use-filtered-tasks';
import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { cn } from '~/lib/utils';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { SheetNav } from '~/modules/common/sheet-nav';
import { sheet } from '~/modules/common/sheeter/state';
import { Button } from '~/modules/ui/button';
import { WorkspaceRoute } from '~/routes/workspaces';
import { useNavigationStore } from '~/store/navigation';
import { useWorkspaceStore } from '~/store/workspace';
import { useWorkspaceUIStore } from '~/store/workspace-ui';
import type { CustomEventEventById, WorkspaceStoreProject, TaskChangeEvent, Project, Task, TaskCRUDEvent } from '~/types';
import { ProjectSettings } from '../project-settings';
import CreateTaskForm, { type TaskImpact, type TaskType } from '~/modules/tasks/create-task-form';
import { isSubTaskData } from '~/modules/tasks/sub-task';
import { isTaskData, TaskCard } from '~/modules/tasks/task';
import { SelectImpact } from '~/modules/tasks/task-selectors/select-impact';
import SetLabels from '~/modules/tasks/task-selectors/select-labels';
import AssignMembers from '~/modules/tasks/task-selectors/select-members';
import SelectStatus, { type TaskStatus } from '~/modules/tasks/task-selectors/select-status';
import { SelectTaskType } from '~/modules/tasks/task-selectors/select-task-type';
import { BoardColumnHeader } from './board-column-header';
import { ColumnSkeleton } from './column-skeleton';
import { useEventListener } from '~/hooks/use-event-listener';
import { useThemeStore } from '~/store/theme';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';
import FocusTrap from '~/modules/common/focus-trap';
import { getRelativeTaskOrder, getTasksList, updateTask, type GetTasksParams } from '~/api/tasks';
import { useMutateTasksQueryData } from '~/hooks/use-mutate-query-data';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';

const MembersTable = lazy(() => import('~/modules/organizations/members-table'));

interface BoardColumnProps {
  expandedTasks: Record<string, boolean>;
  project: WorkspaceStoreProject;
  createForm: boolean;
  toggleCreateForm: (projectId: string) => void;
}

const tasksQueryOptions = ({ projectId }: GetTasksParams) => {
  return queryOptions({
    queryKey: ['boardTasks', projectId],
    queryFn: async () =>
      await getTasksList({
        projectId,
      }),
  });
};

export function BoardColumn({ project, expandedTasks, createForm, toggleCreateForm }: BoardColumnProps) {
  const { t } = useTranslation();

  const columnRef = useRef<HTMLDivElement | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef(null);
  const { mode } = useThemeStore();
  const { menu } = useNavigationStore();
  const { workspace, searchQuery, selectedTasks, focusedTaskId, setFocusedTaskId, labels } = useWorkspaceStore();
  const { workspaces, changeColumn } = useWorkspaceUIStore();

  const projectLabels = labels.filter((l) => l.projectId === project.id);
  const currentProjectSettings = workspaces[workspace.id]?.columns.find((el) => el.columnId === project.id);
  const [showIced, setShowIced] = useState(currentProjectSettings?.expandIced || false);
  const [showAccepted, setShowAccepted] = useState(currentProjectSettings?.expandAccepted || false);

  // Query tasks
  const tasksQuery = useSuspenseQuery(tasksQueryOptions({ projectId: project.id }));

  const callback = useMutateTasksQueryData(['boardTasks', project.id]);

  const handleTaskActionClick = (task: Task, field: string, trigger: HTMLElement) => {
    let component = <SelectTaskType currentType={task.type as TaskType} />;
    if (field === 'impact') component = <SelectImpact value={task.impact as TaskImpact} />;
    else if (field === 'labels') component = <SetLabels value={task.labels} organizationId={task.organizationId} projectId={task.projectId} />;
    else if (field === 'assignedTo') component = <AssignMembers projectId={task.projectId} value={task.assignedTo} />;
    else if (field === 'status') component = <SelectStatus taskStatus={task.status as TaskStatus} />;

    return dropdowner(component, { id: field, trigger, align: ['status', 'assignedTo'].includes(field) ? 'end' : 'start' });
  };

  const tasks = useMemo(() => tasksQuery.data?.items || [], [tasksQuery.data]);

  const { showingTasks, acceptedCount, icedCount } = useTaskFilters(tasks, showAccepted, showIced);

  const handleIcedClick = () => {
    setShowIced(!showIced);
    changeColumn(workspace.id, project.id, {
      expandIced: !showIced,
    });
  };
  const handleAcceptedClick = () => {
    setShowAccepted(!showAccepted);
    changeColumn(workspace.id, project.id, {
      expandAccepted: !showAccepted,
    });
  };

  const openSettingsSheet = () => {
    const projectTabs = [
      { id: 'general', label: 'common:general', element: <ProjectSettings project={project as unknown as Project} sheet /> },
      {
        id: 'members',
        label: 'common:members',
        element: <MembersTable entity={project as unknown as Project} route={WorkspaceRoute.id} isSheet />,
      },
    ];

    sheet.create(<SheetNav tabs={projectTabs} />, {
      className: 'max-w-full lg:max-w-4xl',
      title: t('common:project_settings'),
      text: t('common:project_settings.text'),
      id: 'edit-project',
    });
  };

  const handleTaskFormClick = () => {
    toggleCreateForm(project.id);
  };

  // Open on key press
  const hotKeyPress = (field: string) => {
    const focusedTask = showingTasks.find((t) => t.id === focusedTaskId);
    if (!focusedTask) return;
    const taskCard = document.getElementById(focusedTask.id);
    if (!taskCard) return;
    if (taskCard && document.activeElement !== taskCard) taskCard.focus();
    const trigger = taskCard.querySelector(`#${field}`);
    if (!trigger) return dropdowner.remove();
    handleTaskActionClick(focusedTask, field, trigger as HTMLElement);
  };

  useHotkeys([
    ['a', () => hotKeyPress('assignedTo')],
    ['i', () => hotKeyPress('impact')],
    ['l', () => hotKeyPress('labels')],
    ['s', () => hotKeyPress('status')],
    ['t', () => hotKeyPress('type')],
  ]);

  const handleTaskChangeEventListener = (event: TaskChangeEvent) => {
    const { taskId, direction, projectId } = event.detail;
    if (projectId !== project.id) return;
    const currentFocusedIndex = showingTasks.findIndex((t) => t.id === taskId);
    const { id } = showingTasks[currentFocusedIndex + direction];
    const taskCard = document.getElementById(id);
    if (taskCard && document.activeElement !== taskCard) taskCard.focus();

    setFocusedTaskId(id);
  };

  const handleProjectChangeEventListener = (event: CustomEventEventById) => {
    if (event.detail !== project.id) return;
    const { id } = showingTasks[0];
    const taskCard = document.getElementById(id);
    if (taskCard && document.activeElement !== taskCard) taskCard.focus();
    setFocusedTaskId(id);
  };

  const handleCRUD = (event: TaskCRUDEvent) => {
    const { array, action } = event.detail;
    callback(array, action);
  };

  useEventListener('taskCRUD', handleCRUD);
  useEventListener('taskChange', handleTaskChangeEventListener);
  useEventListener('projectChange', handleProjectChangeEventListener);

  useEffect(() => {
    return combine(
      monitorForElements({
        canMonitor({ source }) {
          return source.data.type === 'task' || source.data.type === 'subTask';
        },
        async onDrop({ location, source }) {
          const target = location.current.dropTargets[0];
          const sourceData = source.data;
          if (!target) return;
          const targetData = target.data;
          const edge: Edge | null = extractClosestEdge(targetData);
          const isTask = isTaskData(sourceData) && isTaskData(targetData);
          const isSubTask = isSubTaskData(sourceData) && isSubTaskData(targetData);
          if (!edge) return;
          if (isSubTask || isTask) {
            const newOrder: number = await getRelativeTaskOrder({
              edge,
              currentOrder: targetData.order,
              sourceId: sourceData.item.id,
              projectId: targetData.item.projectId,
              status: sourceData.item.status,
            });
            if (sourceData.item.projectId !== targetData.item.projectId) {
              const updatedTask = await updateTask(sourceData.item.id, 'projectId', targetData.item.projectId, newOrder);
              callback([updatedTask], 'update');
            } else {
              const updatedTask = await updateTask(sourceData.item.id, 'order', newOrder);
              callback([updatedTask], 'update');
            }
          }
          if (isSubTask) {
            const newOrder: number = await getRelativeTaskOrder({
              edge,
              currentOrder: targetData.order,
              sourceId: sourceData.item.id,
              projectId: targetData.item.projectId,
              parentId: targetData.item.parentId ?? undefined,
            });
            const updatedTask = await updateTask(sourceData.item.id, 'order', newOrder);
            callback([updatedTask], 'updateSubTask');
          }
        },
      }),
    );
  }, [menu]);

  // Hides underscroll elements
  // 4rem refers to the header height
  const stickyBackground = <div className="sm:hidden left-0 right-0 h-4 bg-background sticky top-0 z-30 -mt-4" />;

  return (
    <div ref={columnRef} className="flex flex-col h-full">
      <BoardColumnHeader
        id={project.id}
        thumbnailUrl={project.thumbnailUrl}
        name={project.name}
        createFormClick={handleTaskFormClick}
        openSettings={openSettingsSheet}
        createFormOpen={createForm}
      />
      <div
        className={cn(
          'flex-1 sm:h-[calc(100vh-146px)] relative rounded-b-none max-w-full bg-transparent group/column flex flex-col flex-shrink-0 snap-center border-b opacity-100',
          selectedTasks.length && 'is-selected',
        )}
      >
        {stickyBackground}

        <div className="h-full border-l border-r">
          {createForm && (
            <CreateTaskForm
              projectId={project.id}
              organizationId={project.organizationId}
              tasks={showingTasks}
              labels={projectLabels}
              onCloseForm={() => toggleCreateForm(project.id)}
            />
          )}

          <div ref={containerRef} />

          {tasksQuery.isLoading ? (
            <ColumnSkeleton />
          ) : (
            <div className="h-full flex flex-col" ref={cardListRef}>
              {!!showingTasks.length && (
                <ScrollArea id={project.id} size="indicatorVertical" className="h-full mx-[-.07rem]">
                  <ScrollBar size="indicatorVertical" />
                  <div className="flex flex-col flex-grow">
                    <Button
                      onClick={handleAcceptedClick}
                      variant="ghost"
                      disabled={!acceptedCount}
                      size="sm"
                      className="flex relative justify-start w-full rounded-none gap-1 border-b border-b-green-500/10 ring-inset bg-green-500/5 hover:bg-green-500/10 text-green-500 text-xs -mt-[.07rem]"
                    >
                      <span className="w-6 mr-1 text-center">{acceptedCount}</span>
                      <span>{t('common:accepted').toLowerCase()}</span>
                      {!!acceptedCount && (
                        <ChevronDown
                          size={16}
                          className={`transition-transform absolute right-5 opacity-50 ${showAccepted ? 'rotate-180' : 'rotate-0'}`}
                        />
                      )}
                    </Button>
                    {showingTasks.map((task) => (
                      <FocusTrap key={task.id} mainElementId={task.id} active={task.id === focusedTaskId}>
                        <TaskCard
                          task={task}
                          isExpanded={expandedTasks[task.id] || false}
                          isSelected={selectedTasks.includes(task.id)}
                          isFocused={task.id === focusedTaskId}
                          handleTaskActionClick={handleTaskActionClick}
                          mode={mode}
                        />
                      </FocusTrap>
                    ))}
                    <Button
                      onClick={handleIcedClick}
                      variant="ghost"
                      disabled={!icedCount}
                      size="sm"
                      className="flex relative justify-start w-full rounded-none gap-1 ring-inset text-sky-500 bg-sky-500/5 hover:bg-sky-500/10 text-xs -mt-[.07rem]"
                    >
                      <span className="w-6 mr-1 text-center">{icedCount}</span>
                      <span> {t('common:iced').toLowerCase()}</span>
                      {!!icedCount && (
                        <ChevronDown
                          size={16}
                          className={`transition-transform absolute right-5 opacity-50 ${showIced ? 'rotate-180' : 'rotate-0'}`}
                        />
                      )}
                    </Button>
                  </div>
                </ScrollArea>
              )}

              {!showingTasks.length && !searchQuery && (
                <ContentPlaceholder
                  Icon={Palmtree}
                  title={t('common:no_resource_yet', { resource: t('common:tasks').toLowerCase() })}
                  text={
                    !createForm && (
                      <>
                        <Undo
                          size={200}
                          strokeWidth={0.2}
                          className="max-md:hidden absolute scale-x-0 scale-y-75 rotate-180 text-primary top-4 right-4 translate-y-20 opacity-0 duration-500 delay-500 transition-all group-hover/column:opacity-100 group-hover/column:scale-x-100 group-hover/column:translate-y-0 group-hover/column:rotate-[130deg]"
                        />
                        <p className="inline-flex gap-1 opacity-0 duration-500 transition-opacity group-hover/column:opacity-100">
                          <span>{t('common:click')}</span>
                          <span className="text-primary">{`+${t('common:task')}`}</span>
                          <span>{t('common:no_tasks.text')}</span>
                        </p>
                      </>
                    )
                  }
                />
              )}
              {!tasks.length && searchQuery && (
                <ContentPlaceholder Icon={Search} title={t('common:no_resource_found', { resource: t('common:tasks').toLowerCase() })} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
