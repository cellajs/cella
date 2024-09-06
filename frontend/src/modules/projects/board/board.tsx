import { useNavigate, useSearch } from '@tanstack/react-router';
import { Bird, Redo } from 'lucide-react';
import { Fragment, type LegacyRef, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getTask } from '~/api/tasks';
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
import type { Task, WorkspaceStoreProject } from '~/types';

import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { toast } from 'sonner';
import { updateTask } from '~/api/tasks';
import { useMutateTasksQueryData } from '~/hooks/use-mutate-query-data';
import type { TaskCRUDEvent, TaskCardFocusEvent, TaskCardToggleSelectEvent } from '~/lib/custom-events/types';
import { isSubTaskData, isTaskData } from '~/lib/drag-and-drop';
import { queryClient } from '~/lib/router';
import { handleTaskDropDownClick } from '~/modules/common/dropdowner';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { sheet } from '~/modules/common/sheeter/state';
import { getRelativeTaskOrder, sortAndGetCounts } from '~/modules/tasks/helpers';
import { TaskCard } from '~/modules/tasks/task';
import { useNavigationStore } from '~/store/navigation';
import { useThemeStore } from '~/store/theme';
import { useWorkspaceUIStore } from '~/store/workspace-ui';

const PANEL_MIN_WIDTH = 300;
// Allow resizing of panels
const EMPTY_SPACE_WIDTH = 300;

function getScrollerWidth(containerWidth: number, projectsLength: number) {
  if (containerWidth === 0) return '100%';
  return containerWidth / projectsLength > PANEL_MIN_WIDTH ? '100%' : projectsLength * PANEL_MIN_WIDTH + EMPTY_SPACE_WIDTH;
}

function BoardDesktop({
  workspaceId,
  projects,
  expandedTasks,
  editingTasks,
  columnTaskCreate,
  toggleCreateForm,
}: {
  expandedTasks: Record<string, boolean>;
  editingTasks: Record<string, boolean>;
  projects: WorkspaceStoreProject[];
  workspaceId: string;
  columnTaskCreate: Record<string, boolean>;
  toggleCreateForm: (projectId: string) => void;
}) {
  const { ref, bounds } = useMeasure();
  const scrollerWidth = getScrollerWidth(bounds.width, projects.length);
  const panelMinSize = typeof scrollerWidth === 'number' ? (PANEL_MIN_WIDTH / scrollerWidth) * 100 : 100 / (projects.length + 1); // + 1 so that the panel can be resized to be bigger or smaller

  return (
    <div className="transition sm:h-[calc(100vh-4rem)] md:h-[calc(100vh-4.88rem)] overflow-x-auto" ref={ref as LegacyRef<HTMLDivElement>}>
      <div className="h-[inherit]" style={{ width: scrollerWidth }}>
        <ResizablePanelGroup direction="horizontal" className="flex gap-2 group/board" id="project-panels" autoSaveId={workspaceId}>
          {projects.map((project, index) => {
            const isFormOpen = columnTaskCreate[project.id] || false;
            return (
              <Fragment key={project.id}>
                <ResizablePanel key={project.id} id={project.id} order={index} minSize={panelMinSize}>
                  <BoardColumn
                    expandedTasks={expandedTasks}
                    editingTasks={editingTasks}
                    createForm={isFormOpen}
                    toggleCreateForm={toggleCreateForm}
                    key={project.id}
                    project={project}
                  />
                </ResizablePanel>
                {projects.length > index + 1 && (
                  <ResizableHandle className="w-1.5 rounded border border-background -mx-2 bg-transparent hover:bg-primary/50 data-[resize-handle-state=drag]:bg-primary transition-all" />
                )}
              </Fragment>
            );
          })}
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
  const isDesktopLayout = useBreakpoints('min', 'sm');
  const { workspaces } = useWorkspaceUIStore();

  const [columnTaskCreate, setColumnTaskCreate] = useState<Record<string, boolean>>({});
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [editingTasks, setEditingTasks] = useState<Record<string, boolean>>({});
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

  const toggleCreateTaskForm = (itemId: string) => {
    setColumnTaskCreate((prevState) => ({
      ...prevState,
      [itemId]: !prevState[itemId],
    }));
  };

  const handleVerticalArrowKeyDown = async (event: KeyboardEvent) => {
    if (!projects.length) return;

    const projectSettings = workspaces[workspace.id]?.columns.find((el) => el.columnId === projects[0].id);
    let newFocusedTask: { projectId: string; id: string } | undefined;
    if (focusedTaskId) newFocusedTask = await getTask(focusedTaskId);
    else {
      const { items: tasks } = queryClient.getQueryData(['boardTasks', projects[0].id]) as { items: Task[] };
      const { sortedTasks } = sortAndGetCounts(tasks, projectSettings?.expandAccepted || false, false);
      newFocusedTask = sortedTasks[0];
    }
    if (!newFocusedTask) return;
    const direction = event.key === 'ArrowDown' ? 1 : -1;

    dispatchCustomEvent('taskChange', {
      taskId: newFocusedTask.id,
      projectId: newFocusedTask.projectId,
      direction: focusedTaskId ? direction : 0,
    });
  };

  const handleHorizontalArrowKeyDown = async (event: KeyboardEvent) => {
    if (!projects.length) return;
    const projectSettings = workspaces[workspace.id]?.columns.find((el) => el.columnId === projects[0].id);
    let newFocusedTask: { projectId: string } | undefined;
    if (focusedTaskId) newFocusedTask = await getTask(focusedTaskId);
    else {
      const { items: tasks } = queryClient.getQueryData(['boardTasks', projects[0].id]) as { items: Task[] };
      const { sortedTasks } = sortAndGetCounts(tasks, projectSettings?.expandAccepted || false, false);
      newFocusedTask = sortedTasks[0];
    }

    if (!newFocusedTask) return;
    const currentProjectIndex = projects.findIndex((p) => p.id === newFocusedTask.projectId);

    const nextProjectIndex = event.key === 'ArrowRight' ? currentProjectIndex + 1 : currentProjectIndex - 1;
    const nextProject = projects[nextProjectIndex];

    if (!nextProject) return;
    dispatchCustomEvent('projectChange', nextProject.id);
  };

  const handleNKeyDown = async () => {
    if (!projects.length) return;

    const focusedTask = await getTask(focusedTaskId ? focusedTaskId : projects[0].id);
    if (!focusedTask) return;

    const projectIndex = projects.findIndex((p) => p.id === focusedTask.projectId);
    if (projectIndex === -1) return;

    toggleCreateTaskForm(projects[projectIndex].id);
  };

  const setTaskExpanded = (taskId: string, isExpanded: boolean) => {
    setExpandedTasks((prevState) => ({
      ...prevState,
      [taskId]: isExpanded,
    }));
  };
  const setTaskEditing = (taskId: string, isEditing: boolean) => {
    setEditingTasks((prevState) => ({
      ...prevState,
      [taskId]: isEditing,
    }));
  };

  const handleEscKeyPress = () => {
    if (!focusedTaskId || !expandedTasks[focusedTaskId]) return;
    setTaskExpanded(focusedTaskId, false);
  };

  const handleEnterKeyPress = () => {
    if (!focusedTaskId) return;
    setTaskExpanded(focusedTaskId, true);
    if (expandedTasks[focusedTaskId]) setTaskEditing(focusedTaskId, true);
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
    const { taskId, clickTarget } = event.detail;

    if (clickTarget.tagName === 'BUTTON' || clickTarget.closest('button')) return setFocusedTaskId(taskId);
    if (focusedTaskId === taskId) return setTaskExpanded(taskId, true);

    const taskCard = document.getElementById(taskId);
    if (taskCard && document.activeElement !== taskCard) taskCard.focus();

    setFocusedTaskId(taskId);
    setTaskExpanded(taskId, true);
  };

  const handleToggleTaskSelect = (event: TaskCardToggleSelectEvent) => {
    const { selected, taskId } = event.detail;
    if (selected) return setSelectedTasks([...selectedTasks, taskId]);
    return setSelectedTasks(selectedTasks.filter((id) => id !== taskId));
  };

  const handleOpenTaskSheet = (taskId: string) => {
    navigate({
      replace: true,
      resetScroll: false,
      search: (prev) => ({
        ...prev,
        ...{ taskIdPreview: taskId },
      }),
    });
    sheet.create(
      <TaskCard mode={mode} task={currentTask} tasks={tasks} isEditing={true} isExpanded={true} isSelected={false} isFocused={true} isSheet />,
      {
        className: 'max-w-full lg:max-w-4xl',
        title: <span className="pl-4">{t('app:task')}</span>,
        id: `task-preview-${taskId}`,
      },
    );
  };

  const handleCRUD = (event: TaskCRUDEvent) => {
    const { array, action, projectId } = event.detail;
    const callback = useMutateTasksQueryData(['boardTasks', projectId]);
    callback(array, action);
    const { items: tasks } = queryClient.getQueryData(['boardTasks', projectId]) as { items: Task[] };
    if (!tasks.length || !sheet.get(`task-preview-${focusedTaskId}`)) return;
    const [sheetTask] = tasks.filter((t) => t.id === focusedTaskId);
    sheet.update(`task-preview-${sheetTask.id}`, {
      content: <TaskCard mode={mode} task={sheetTask} tasks={tasks} isEditing={true} isExpanded={true} isSelected={false} isFocused={true} isSheet />,
    });
  };

  useEventListener('taskCRUD', handleCRUD);
  useEventListener('taskCardClick', handleTaskClick);
  useEventListener('toggleSelectTask', handleToggleTaskSelect);
  useEventListener('toggleCard', (e) => setTaskExpanded(e.detail, !expandedTasks[e.detail]));
  useEventListener('openTaskCardPreview', (event) => handleOpenTaskSheet(event.detail));
  useEventListener('toggleTaskEditing', (e) => setTaskEditing(e.detail.id, e.detail.state));

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
                const updatedTask = await updateTask(sourceData.item.id, 'projectId', targetData.item.projectId, newOrder);
                const targetProjectCallback = useMutateTasksQueryData(['boardTasks', targetData.item.projectId]);
                mainCallback([updatedTask], 'delete');
                targetProjectCallback([updatedTask], 'create');
              } else {
                const updatedTask = await updateTask(sourceData.item.id, 'order', newOrder);
                mainCallback([updatedTask], 'update');
              }
            } catch (err) {
              toast.error(t('common:error.reorder_resources', { resources: t('app:todo') }));
            }
          }

          if (isSubTask) {
            const newOrder = getRelativeTaskOrder(edge, tasks, targetData.order, sourceData.item.id, targetData.item.parentId ?? undefined);
            try {
              const updatedTask = await updateTask(sourceData.item.id, 'order', newOrder);
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
      <BoardHeader />
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
          {isDesktopLayout ? (
            <BoardDesktop
              expandedTasks={expandedTasks}
              editingTasks={editingTasks}
              columnTaskCreate={columnTaskCreate}
              toggleCreateForm={toggleCreateTaskForm}
              projects={projects}
              workspaceId={workspace.id}
            />
          ) : (
            <BoardColumn
              expandedTasks={expandedTasks}
              editingTasks={editingTasks}
              createForm={columnTaskCreate[mobileDeviceProject.id] || false}
              toggleCreateForm={toggleCreateTaskForm}
              project={mobileDeviceProject}
            />
          )}
        </>
      )}
    </>
  );
}
