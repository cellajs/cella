import { useNavigate, useSearch } from '@tanstack/react-router';
import { Bird, Redo } from 'lucide-react';
import { Fragment, type LegacyRef, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useEventListener } from '~/hooks/use-event-listener';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { useMeasure } from '~/hooks/use-measure';
import { dispatchCustomEvent } from '~/lib/custom-events';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { BoardColumn } from '~/modules/projects/board/board-column';
import BoardHeader from '~/modules/projects/board/header/board-header';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '~/modules/ui/resizable';
import { WorkspaceBoardRoute } from '~/routes/workspaces';
import { useWorkspaceStore } from '~/store/workspace';
import type { Project, SubTask, Task } from '~/types/app';
import type { ContextEntity, DraggableItemData, Membership } from '~/types/common';

import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { toast } from 'sonner';
import { updateTask } from '~/api/tasks';
import { useMutateTasksQueryData, useMutateWorkSpaceQueryData } from '~/hooks/use-mutate-query-data';
import { queryClient } from '~/lib/router';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { sheet } from '~/modules/common/sheeter/state';
import { getRelativeTaskOrder, sortAndGetCounts } from '~/modules/tasks/helpers';
import { TaskCard } from '~/modules/tasks/task';
import { handleTaskDropDownClick } from '~/modules/tasks/task-selectors/drop-down-trigger';
import type { TaskCardFocusEvent, TaskCardToggleSelectEvent, TaskOperationEvent, TaskStates, TaskStatesChangeEvent } from '~/modules/tasks/types';
import { useNavigationStore } from '~/store/navigation';
import { useThemeStore } from '~/store/theme';
import { useWorkspaceUIStore } from '~/store/workspace-ui';

const PANEL_MIN_WIDTH = 300;
// Allow resizing of panels
const EMPTY_SPACE_WIDTH = 300;

// TODO can this be simplified or moved?
export type TaskDraggableItemData = DraggableItemData<Task> & { type: 'task' };
export type SubTaskDraggableItemData = DraggableItemData<SubTask> & { type: 'subTask' };

export const isTaskData = (data: Record<string | symbol, unknown>): data is TaskDraggableItemData => {
  return data.dragItem === true && typeof data.order === 'number' && data.type === 'task';
};
export const isSubTaskData = (data: Record<string | symbol, unknown>): data is SubTaskDraggableItemData => {
  return data.dragItem === true && typeof data.order === 'number' && data.type === 'subTask';
};

function getScrollerWidth(containerWidth: number, projectsLength: number) {
  if (containerWidth === 0) return '100%';
  return containerWidth / projectsLength > PANEL_MIN_WIDTH ? '100%' : projectsLength * PANEL_MIN_WIDTH + EMPTY_SPACE_WIDTH;
}

function BoardDesktop({
  workspaceId,
  projects,
  tasksState,
}: {
  tasksState: Record<string, TaskStates>;
  projects: Project[];
  workspaceId: string;
}) {
  const { ref, bounds } = useMeasure();
  const { changePanels, workspacesPanels } = useWorkspaceUIStore();
  const scrollerWidth = getScrollerWidth(bounds.width, projects.length);
  const panelMinSize = typeof scrollerWidth === 'number' ? (PANEL_MIN_WIDTH / scrollerWidth) * 100 : 100 / (projects.length + 1); // + 1 so that the panel can be resized to be bigger or smaller

  const panelStorage = useMemo(
    () => ({
      getItem: (_: string) => {
        const panel = workspacesPanels[workspaceId];
        return panel ?? null;
      },
      setItem: (_: string, value: string) => {
        changePanels(workspaceId, value);
      },
    }),
    [],
  );
  return (
    <div className="transition sm:h-[calc(100vh-4rem)] md:h-[calc(100vh-4.88rem)] overflow-x-auto" ref={ref as LegacyRef<HTMLDivElement>}>
      <div className="h-[inherit]" style={{ width: scrollerWidth }}>
        <ResizablePanelGroup
          direction="horizontal"
          className="flex gap-2 group/board"
          id="project-panels"
          storage={panelStorage}
          autoSaveId={workspaceId}
        >
          {projects.map((project, index) => (
            <Fragment key={project.id}>
              <ResizablePanel id={project.id} order={project.membership?.order || index} minSize={panelMinSize}>
                <BoardColumn tasksState={tasksState} project={project} />
              </ResizablePanel>
              {projects.length > index + 1 && (
                <ResizableHandle className="w-1.5 rounded border border-background -mx-2 bg-transparent hover:bg-primary/50 data-[resize-handle-state=drag]:bg-primary transition-all" />
              )}
            </Fragment>
          ))}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

export default function Board() {
  const { t } = useTranslation();
  const { mode } = useThemeStore();
  const navigate = useNavigate();
  const { menu } = useNavigationStore();
  const { workspace, projects, focusedTaskId, selectedTasks, setFocusedTaskId, setSearchQuery, setSelectedTasks } = useWorkspaceStore();
  const isMobile = useBreakpoints('max', 'sm');
  const { workspaces } = useWorkspaceUIStore();

  const [tasksState, setTasksState] = useState<Record<string, TaskStates>>({});

  const { project, q, taskIdPreview } = useSearch({
    from: WorkspaceBoardRoute.id,
  });

  // Finding the project based on the query parameter or defaulting to the first project
  const mobileDeviceProject = useMemo(() => {
    if (project) return projects.find((p) => p.slug === project) || projects[0];
    return projects[0];
  }, [project, projects]);

  const queries = queryClient.getQueriesData({ queryKey: ['boardTasks'] });

  const tasks = useMemo(() => {
    return queries.flatMap((el) => {
      const [, data] = el as [string[], undefined | { items: Task[] }];
      return data?.items ?? [];
    });
  }, [queries]);

  const [currentTask] = useMemo(() => {
    const taskId = taskIdPreview ? taskIdPreview : focusedTaskId;
    return tasks.filter((t) => t.id === taskId);
  }, [tasks, focusedTaskId, taskIdPreview]);

  const handleVerticalArrowKeyDown = async (event: KeyboardEvent) => {
    if (!projects.length || (focusedTaskId && (tasksState[focusedTaskId] === 'editing' || tasksState[focusedTaskId] === 'unsaved'))) return;

    const projectSettings = workspaces[workspace.id]?.[projects[0].id];
    let newFocusedTask: { projectId: string; id: string } | undefined;
    if (focusedTaskId) {
      newFocusedTask = tasks.find((t) => t.id === focusedTaskId);
    } else {
      const { items: tasks } = queryClient.getQueryData(['boardTasks', projects[0].id]) as { items: Task[] };
      const { sortedTasks } = sortAndGetCounts(tasks, projectSettings?.expandAccepted || false, false);
      newFocusedTask = sortedTasks[0];
    }
    if (!newFocusedTask) return;
    const direction = event.key === 'ArrowDown' ? 1 : -1;

    dispatchCustomEvent('focusedTaskChange', {
      taskId: newFocusedTask.id,
      projectId: newFocusedTask.projectId,
      direction: focusedTaskId ? direction : 0,
    });
  };

  const handleHorizontalArrowKeyDown = async (event: KeyboardEvent) => {
    if (!projects.length) return;
    const projectSettings = workspaces[workspace.id]?.[projects[0].id];
    let newFocusedTask: { projectId: string } | undefined;
    if (focusedTaskId) {
      newFocusedTask = tasks.find((t) => t.id === focusedTaskId);
    } else {
      const { items: tasks } = queryClient.getQueryData(['boardTasks', projects[0].id]) as { items: Task[] };
      const { sortedTasks } = sortAndGetCounts(tasks, projectSettings?.expandAccepted || false, false);
      newFocusedTask = sortedTasks[0];
    }

    if (!newFocusedTask) return;
    const currentProjectIndex = projects.findIndex((p) => p.id === newFocusedTask.projectId);

    const nextProjectIndex = event.key === 'ArrowRight' ? currentProjectIndex + 1 : currentProjectIndex - 1;
    const nextProject = projects[nextProjectIndex];

    if (!nextProject) return;
    dispatchCustomEvent('focusedProjectChange', nextProject.id);
  };

  const setTaskState = (taskId: string, state: TaskStates) => {
    setTasksState((prevState) => ({
      ...prevState,
      [taskId]: state,
    }));
  };

  const handleEscKeyPress = () => {
    if (!focusedTaskId) return;
    const taskState = tasksState[focusedTaskId];
    if (!taskState || taskState === 'folded') return;
    if (taskState === 'editing' || taskState === 'unsaved') return setTaskState(focusedTaskId, 'expanded');
    if (taskState === 'expanded') return setTaskState(focusedTaskId, 'folded');
  };

  const handleEnterKeyPress = () => {
    if (!focusedTaskId) return;
    const taskState = tasksState[focusedTaskId];
    if (taskState === 'folded') setTaskState(focusedTaskId, 'expanded');
    if (taskState === 'expanded') setTaskState(focusedTaskId, 'editing');
  };

  const handleNKeyDown = async () => {
    if (!projects.length) return;
    if (!focusedTaskId) return dispatchCustomEvent('toggleCreateTaskForm', projects[0].id);

    const focusedTask = tasks.find((t) => t.id === focusedTaskId);
    if (!focusedTask) return;
    const project = projects.find((p) => p.id === focusedTask.projectId);
    dispatchCustomEvent('toggleCreateTaskForm', project?.id ?? projects[0].id);
  };

  // Open on key press
  const hotKeyPress = (field: string) => {
    if (!currentTask) return;
    const taskCard = document.getElementById(currentTask.id);
    if (!taskCard) return;
    if (taskCard && document.activeElement !== taskCard) taskCard.focus();
    const trigger = taskCard.querySelector(`#${field}`);
    if (!trigger) return dropdowner.remove();
    handleTaskDropDownClick(currentTask, field, trigger as HTMLElement);
  };

  useHotkeys([
    ['ArrowRight', handleHorizontalArrowKeyDown],
    ['ArrowLeft', handleHorizontalArrowKeyDown],
    ['ArrowDown', handleVerticalArrowKeyDown],
    ['ArrowUp', handleVerticalArrowKeyDown],
    ['Escape', handleEscKeyPress],
    ['Enter', handleEnterKeyPress],
    ['N', handleNKeyDown],
    ['A', () => hotKeyPress('assignedTo')],
    ['I', () => hotKeyPress('impact')],
    ['L', () => hotKeyPress('labels')],
    ['S', () => hotKeyPress(`status-${focusedTaskId}`)],
    ['T', () => hotKeyPress('type')],
  ]);

  const handleTaskClick = (event: TaskCardFocusEvent) => {
    const { taskId: newFocused, clickTarget } = event.detail;
    const currentFocused = focusedTaskId;

    // Check if the clicked element is a button or inside a button,
    // if so, set the new focused task and return early (no need to fold/expand in this case)
    if (clickTarget.tagName === 'BUTTON' || clickTarget.closest('button')) {
      if (clickTarget.id === 'edit-toggle' && currentFocused) {
        // Set the state of the previously focused task after edit button clicked
        setTaskState(currentFocused, tasksState[currentFocused] === 'folded' || !tasksState[currentFocused] ? 'folded' : 'expanded');
      }
      return setFocusedTaskId(newFocused);
    }

    // If the task clicked is already focused
    if (currentFocused === newFocused) return setTaskState(currentFocused, 'expanded');

    // If there's a different task already focused
    if (currentFocused && currentFocused !== newFocused) {
      //change the state of previously focused subtasks
      dispatchCustomEvent('changeSubTaskState', { taskId: currentFocused, state: 'folded' });

      // Set the state of the previously focused task
      setTaskState(currentFocused, tasksState[currentFocused] === 'folded' || !tasksState[currentFocused] ? 'folded' : 'expanded');
      // Set the state of the newly focused task
      setTaskState(newFocused, 'expanded');
    }

    // If there's no currently focused task, expand the newly focused task
    if (!currentFocused) setTaskState(newFocused, 'expanded');

    // ensure newly focused task receives focus
    const taskCard = document.getElementById(newFocused);
    if (taskCard && document.activeElement !== taskCard) taskCard.focus();
    // Set the new focused task ID
    setFocusedTaskId(newFocused);
  };

  const handleToggleTaskSelect = (event: TaskCardToggleSelectEvent) => {
    const { selected, taskId } = event.detail;
    if (selected) return setSelectedTasks([...selectedTasks, taskId]);
    return setSelectedTasks(selectedTasks.filter((id) => id !== taskId));
  };

  const handleOpenTaskSheet = useCallback(
    (taskId: string) => {
      if (!focusedTaskId || focusedTaskId !== taskId) setFocusedTaskId(taskId);
      navigate({
        to: '.',
        replace: true,
        resetScroll: false,
        search: (prev) => ({
          ...prev,
          ...{ taskIdPreview: taskId },
        }),
      });
      sheet.create(<TaskCard mode={mode} task={currentTask} tasks={tasks} state={'editing'} isSelected={false} isFocused={true} isSheet />, {
        className: 'max-w-full lg:max-w-4xl',
        title: <span className="pl-4">{t('app:task')}</span>,
        id: `task-preview-${taskId}`,
      });
    },
    [currentTask, focusedTaskId, tasks],
  );

  const handleTaskOperations = (event: TaskOperationEvent) => {
    const { array, action, projectId } = event.detail;
    const callback = useMutateTasksQueryData(['boardTasks', projectId]);
    callback(array, action);
    const { items: tasks } = queryClient.getQueryData(['boardTasks', projectId]) as { items: Task[] };
    if (!tasks.length || !sheet.get(`task-preview-${focusedTaskId}`)) return;
    const [sheetTask] = tasks.filter((t) => t.id === focusedTaskId);
    sheet.update(`task-preview-${sheetTask.id}`, {
      content: <TaskCard mode={mode} task={sheetTask} tasks={tasks} state={'editing'} isSelected={false} isFocused={true} isSheet />,
    });
  };

  const callback = useMutateWorkSpaceQueryData(['workspaces', workspace.slug]);
  const handleEntityUpdate = (event: { detail: { membership: Membership; entity: ContextEntity } }) => {
    const { entity, membership } = event.detail;
    if (entity !== 'workspace' && entity !== 'project') return;
    callback([membership], entity === 'project' ? 'updateProjectMembership' : 'updateWorkspaceMembership');
  };

  const handleTaskState = (event: TaskStatesChangeEvent) => {
    const { taskId, state } = event.detail;
    setTaskState(taskId, state);
  };

  useEventListener('changeTaskState', handleTaskState);
  useEventListener('menuEntityChange', handleEntityUpdate);
  useEventListener('taskOperation', handleTaskOperations);
  useEventListener('toggleTaskCard', handleTaskClick);
  useEventListener('toggleSelectTask', handleToggleTaskSelect);
  useEventListener('openTaskCardPreview', (event) => handleOpenTaskSheet(event.detail));

  useEffect(() => {
    if (focusedTaskId) return;
    // new state object with updated values
    const updatedTasksState = { ...tasksState };
    const states = Object.entries(updatedTasksState);
    // Find a key that has the value 'editing'
    const key = states.find(([_, value]) => value === 'editing')?.[0];
    if (!key) return;
    updatedTasksState[key] = 'expanded';
    setTasksState(updatedTasksState);
  }, [focusedTaskId, tasksState]);

  useEffect(() => {
    if (q?.length) setSearchQuery(q);
    if (taskIdPreview) handleOpenTaskSheet(taskIdPreview);
  }, []);

  useEffect(() => {
    return combine(
      monitorForElements({
        canMonitor({ source }) {
          return (isTaskData(source.data) || isSubTaskData(source.data)) && !sheet.getAll().length;
        },
        async onDrop({ location, source }) {
          const target = location.current.dropTargets[0];
          if (!target) return;
          const sourceData = source.data;
          const targetData = target.data;

          const edge: Edge | null = extractClosestEdge(targetData);
          if (!edge) return;

          const isTask = isTaskData(sourceData) && isTaskData(targetData);
          const isSubTask = isSubTaskData(sourceData) && isSubTaskData(targetData);

          if (!isTask && !isSubTask) return;

          const { items: tasks } = queryClient.getQueryData(['boardTasks', sourceData.item.projectId]) as { items: Task[] };
          const mainCallback = useMutateTasksQueryData(['boardTasks', sourceData.item.projectId]);
          if (isTask) {
            const newOrder: number = getRelativeTaskOrder(edge, tasks, targetData.order, sourceData.item.id, undefined, sourceData.item.status);

            try {
              if (sourceData.item.projectId !== targetData.item.projectId) {
                const updatedTask = await updateTask(sourceData.item.id, workspace.organizationId, 'projectId', targetData.item.projectId, newOrder);
                const targetProjectCallback = useMutateTasksQueryData(['boardTasks', targetData.item.projectId]);
                mainCallback([updatedTask], 'delete');
                targetProjectCallback([updatedTask], 'create');
              } else {
                const updatedTask = await updateTask(sourceData.item.id, workspace.organizationId, 'order', newOrder);
                mainCallback([updatedTask], 'update');
              }
            } catch (err) {
              toast.error(t('common:error.reorder_resources', { resources: t('app:todo') }));
            }
          }

          if (isSubTask) {
            const newOrder = getRelativeTaskOrder(edge, tasks, targetData.order, sourceData.item.id, targetData.item.parentId ?? undefined);
            try {
              const updatedTask = await updateTask(sourceData.item.id, workspace.organizationId, 'order', newOrder);
              mainCallback([updatedTask], 'updateSubTask');
            } catch (err) {
              toast.error(t('common:error.reorder_resources', { resources: t('app:todo') }));
            }
          }
        },
      }),
    );
  }, [menu]);

  return (
    <>
      <BoardHeader project={isMobile ? mobileDeviceProject : null} />
      {!projects.length ? (
        <ContentPlaceholder
          className=" h-[calc(100vh-4rem-4rem)] sm:h-[calc(100vh-4.88rem)]"
          Icon={Bird}
          title={t('common:no_resource_yet', { resource: t('app:projects').toLowerCase() })}
          text={
            <>
              <Redo
                size={200}
                strokeWidth={0.2}
                className="max-md:hidden absolute scale-x-0 scale-y-75 -rotate-180 text-primary top-4 right-44 translate-y-20 opacity-0 duration-500 delay-500 transition-all group-hover/workspace:opacity-100 group-hover/workspace:scale-x-100 group-hover/workspace:translate-y-0 group-hover/workspace:rotate-[-130deg]"
              />
              <p className="inline-flex gap-1 opacity-0 duration-500 transition-opacity group-hover/workspace:opacity-100">
                <span>{t('common:click')}</span>
                <span className="text-primary">{`+ ${t('common:add')}`}</span>
                <span>{t('app:no_projects.text')}</span>
              </p>
            </>
          }
        />
      ) : (
        <>
          {isMobile ? (
            <BoardColumn tasksState={tasksState} project={mobileDeviceProject} />
          ) : (
            <BoardDesktop tasksState={tasksState} projects={projects} workspaceId={workspace.id} />
          )}
        </>
      )}
    </>
  );
}
