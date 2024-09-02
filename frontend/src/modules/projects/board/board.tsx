import { useSearch } from '@tanstack/react-router';
import { Bird, Redo } from 'lucide-react';
import { Fragment, type LegacyRef, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getTask, getTaskByProjectId } from '~/api/tasks';
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
import type { WorkspaceStoreProject } from '~/types';

import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { toast } from 'sonner';
import { getRelativeTaskOrder, updateTask } from '~/api/tasks';
import { useMutateTasksQueryData } from '~/hooks/use-mutate-query-data';
import type { TaskCardFocusEvent, TaskCardToggleSelectEvent } from '~/lib/custom-events/types';
import { isSubTaskData, isTaskData } from '~/lib/drag-and-drop';
import { useNavigationStore } from '~/store/navigation';
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
  columnTaskCreate,
  toggleCreateForm,
}: {
  expandedTasks: Record<string, boolean>;
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
  const { menu } = useNavigationStore();
  const { workspace, projects, focusedTaskId, selectedTasks, setFocusedTaskId, setSearchQuery, setSelectedTasks } = useWorkspaceStore();
  const isDesktopLayout = useBreakpoints('min', 'sm');
  const { workspaces } = useWorkspaceUIStore();

  const [columnTaskCreate, setColumnTaskCreate] = useState<Record<string, boolean>>({});
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const { project, q } = useSearch({
    from: WorkspaceBoardRoute.id,
  });

  // Finding the project based on the query parameter or defaulting to the first project
  const mobileDeviceProject = useMemo(() => {
    if (project) return projects.find((p) => p.slug === project) || projects[0];
    return projects[0];
  }, [project, projects]);

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
    else newFocusedTask = await getTaskByProjectId(projects[0].id, projectSettings?.expandAccepted);

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
    else newFocusedTask = await getTaskByProjectId(projects[0].id, projectSettings?.expandAccepted);

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

  const handleEscKeyPress = () => {
    if (focusedTaskId && expandedTasks[focusedTaskId]) setTaskExpanded(focusedTaskId, false);
  };

  const handleEnterKeyPress = () => {
    if (!focusedTaskId) return;
    setTaskExpanded(focusedTaskId, true);
  };

  useHotkeys([
    ['ArrowRight', handleHorizontalArrowKeyDown],
    ['ArrowLeft', handleHorizontalArrowKeyDown],
    ['ArrowDown', handleVerticalArrowKeyDown],
    ['ArrowUp', handleVerticalArrowKeyDown],
    ['N', handleNKeyDown],
    ['Escape', handleEscKeyPress],
    ['Enter', handleEnterKeyPress],
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

  useEventListener('taskCardClick', handleTaskClick);
  useEventListener('toggleSelectTask', handleToggleTaskSelect);
  useEventListener('toggleCard', (e) => setTaskExpanded(e.detail, !expandedTasks[e.detail]));

  useEffect(() => {
    if (q?.length) setSearchQuery(q);
  }, []);

  useEffect(() => {
    return combine(
      monitorForElements({
        canMonitor({ source }) {
          return isTaskData(source.data) || isSubTaskData(source.data);
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

          if (isTask) {
            const mainCallback = useMutateTasksQueryData(['boardTasks', sourceData.item.projectId]);
            const newOrder: number = await getRelativeTaskOrder({
              edge,
              currentOrder: targetData.order,
              sourceId: sourceData.item.id,
              projectId: targetData.item.projectId,
              status: sourceData.item.status,
            });
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
              toast.error(t('common:error.reorder_resources', { resources: t('common:todo') }));
            }
          }

          if (isSubTask) {
            const mainCallback = useMutateTasksQueryData(['boardTasks', sourceData.item.projectId]);
            const newOrder: number = await getRelativeTaskOrder({
              edge,
              currentOrder: targetData.order,
              sourceId: sourceData.item.id,
              projectId: targetData.item.projectId,
              parentId: targetData.item.parentId ?? undefined,
            });
            try {
              const updatedTask = await updateTask(sourceData.item.id, 'order', newOrder);
              mainCallback([updatedTask], 'updateSubTask');
            } catch (err) {
              toast.error(t('common:error.reorder_resources', { resources: t('common:todo') }));
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
          title={t('common:no_resource_yet', { resource: t('common:projects').toLowerCase() })}
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
                <span>{t('common:no_projects.text')}</span>
              </p>
            </>
          }
        />
      ) : (
        <>
          {isDesktopLayout ? (
            <BoardDesktop
              expandedTasks={expandedTasks}
              columnTaskCreate={columnTaskCreate}
              toggleCreateForm={toggleCreateTaskForm}
              projects={projects}
              workspaceId={workspace.id}
            />
          ) : (
            <BoardColumn
              expandedTasks={expandedTasks}
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
