import { useSearch } from '@tanstack/react-router';
import { Bird, Redo } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useEventListener } from '~/hooks/use-event-listener';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { useMeasure } from '~/hooks/use-measure';
import { dispatchCustomEvent } from '~/lib/custom-events';
import BoardHeader from '~/modules/app/board-header';
import { BoardColumn } from '~/modules/app/board/board-column';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '~/modules/ui/resizable';
import { WorkspaceBoardRoute } from '~/routes/workspaces';
import { useWorkspaceStore } from '~/store/workspace';
import type { Project, Task } from '~/types/app';
import type { ContextEntity, Membership } from '~/types/common';

import type { ImperativePanelHandle } from 'react-resizable-panels';
import { queryClient } from '~/lib/router';
import WorkspaceActions from '~/modules/app/board/workspace-actions';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { taskKeys } from '~/modules/common/query-client-provider/tasks';
import { handleTaskDropDownClick, setTaskCardFocus, sortAndGetCounts } from '~/modules/tasks/helpers';
import type { TaskCardToggleSelectEvent, TaskStates, TaskStatesChangeEvent } from '~/modules/tasks/types';
import { useWorkspaceQuery } from '~/modules/workspaces/helpers/use-workspace';
import { defaultColumnValues, useWorkspaceUIStore } from '~/store/workspace-ui';

// TODO empty space width should be dynamic based on window width and amount of projects and width of each project?
const PANEL_MIN_WIDTH = 400;
// Allow resizing of panels
const EMPTY_SPACE_WIDTH = 600;

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
  const panelRefs = useRef<Record<string, ImperativePanelHandle | null>>({});
  const { changePanels, workspacesPanels, workspaces } = useWorkspaceUIStore();

  const panelStorage = useMemo(
    () => ({
      getItem: (_: string) => workspacesPanels[workspaceId] ?? null,
      setItem: (_: string, value: string) => changePanels(workspaceId, value),
    }),
    [workspacesPanels, workspaceId],
  );

  const projectSettingsMap = useMemo(() => {
    return projects.map((project) => ({
      project,
      settings: workspaces[workspaceId]?.[project.id],
    }));
  }, [projects, workspaces, workspaceId]);

  const scrollerWidth = getScrollerWidth(bounds.width, projectSettingsMap.filter((p) => !p.settings?.minimized).length);
  const panelMinSize = useMemo(() => {
    if (typeof scrollerWidth === 'number') return (PANEL_MIN_WIDTH / scrollerWidth) * 100;

    const projectsLength = projectSettingsMap.filter((p) => !p.settings?.minimized).length;
    return 100 / (projectsLength + 1); // + 1 to allow resizing
  }, [scrollerWidth, projectSettingsMap]);

  useEffect(() => {
    for (const { project, settings } of projectSettingsMap) {
      const panel = panelRefs.current[project.id];
      if (panel) settings?.minimized ? panel.collapse() : panel.expand();
    }
  }, [projectSettingsMap]);

  return (
    <div className="transition sm:h-[calc(100vh-4rem)] md:h-[calc(100vh-4.88rem)] overflow-x-auto" ref={ref as React.Ref<HTMLDivElement>}>
      <div className="h-[inherit]" style={{ width: scrollerWidth }}>
        <ResizablePanelGroup
          direction="horizontal"
          className="flex gap-2 group/board"
          id="project-panels"
          storage={panelStorage}
          autoSaveId={workspaceId}
        >
          {projectSettingsMap.map(({ project, settings }, index) => (
            <Fragment key={project.id}>
              <ResizablePanel
                // biome-ignore lint/suspicious/noAssignInExpressions: need to minimize
                ref={(el) => (panelRefs.current[project.id] = el)}
                id={project.id}
                order={project.membership?.order || index}
                collapsedSize={panelMinSize * 0.1}
                minSize={panelMinSize}
                collapsible
              >
                <BoardColumn tasksState={tasksState} project={project} settings={settings} />
              </ResizablePanel>
              {index < projects.length - 1 && (
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
  const { focusedTaskId, selectedTasks, setSearchQuery, setSelectedTasks } = useWorkspaceStore();
  const prevFocusedRef = useRef<string | null>(focusedTaskId);
  const {
    data: { workspace, projects: queryProjects },
    updateProjectMembership,
    updateWorkspaceMembership,
  } = useWorkspaceQuery();

  const isMobile = useBreakpoints('max', 'sm');

  const { workspaces, changeColumn } = useWorkspaceUIStore();

  const [tasksState, setTasksState] = useState<Record<string, TaskStates>>({});

  const { project, q } = useSearch({
    from: WorkspaceBoardRoute.id,
  });

  // TODO maybe find other way
  const projects = useMemo(
    () => queryProjects.filter((p) => !p.membership?.archived).sort((a, b) => (a.membership?.order ?? 0) - (b.membership?.order ?? 0)),
    [queryProjects],
  );

  // Finding the project based on the query parameter or defaulting to the first project
  const mobileDeviceProject = useMemo(() => {
    if (project) return projects.find((p) => p.slug === project) || projects[0];
    return projects[0];
  }, [project, projects]);

  const queries = queryClient.getQueriesData({ queryKey: taskKeys.lists() });

  const tasks = useMemo(() => {
    return queries.flatMap((el) => {
      const [, data] = el as [string[], undefined | { items: Task[] }];
      return data?.items ?? [];
    });
  }, [queries]);

  // TODO perhaps move this out of the component together with all hotkeys?
  const [currentTask] = useMemo(() => tasks.filter((t) => t.id === focusedTaskId), [tasks, focusedTaskId]);

  const handleVerticalArrowKeyDown = async (event: KeyboardEvent) => {
    if (!projects.length || !tasks.length) return;
    if (focusedTaskId && (tasksState[focusedTaskId] === 'editing' || tasksState[focusedTaskId] === 'unsaved')) return;

    const direction = focusedTaskId ? (event.key === 'ArrowDown' ? 1 : -1) : 0;

    // Get currently focused task and project
    const currentFocused = tasks.find((t) => t.id === focusedTaskId);
    const currentProject = projects.find((p) => p.id === currentFocused?.projectId) ?? projects[0];

    // Extract project settings
    const { expandAccepted, expandIced } = (workspaces[workspace.id] && workspaces[workspace.id][currentProject.id]) || defaultColumnValues;

    // Filter and sort tasks for the current project
    const projectTasks = tasks.filter((t) => t.projectId === currentProject.id);
    const { filteredTasks } = sortAndGetCounts(projectTasks, expandAccepted, expandIced);

    const taskIndex = focusedTaskId ? filteredTasks.findIndex((t) => t.id === focusedTaskId) : 0;
    // Ensure the next task in the direction exists
    const nextTask = filteredTasks[taskIndex + direction];
    if (!nextTask) return;

    setTaskCardFocus(nextTask.id);
  };

  const handleHorizontalArrowKeyDown = async (event: KeyboardEvent) => {
    if (!projects.length) return;

    // Get the currently focused task and project index
    const currentFocused = tasks.find((t) => t.id === focusedTaskId);
    const currentProjectIndex = projects.findIndex((p) => p.id === currentFocused?.projectId);

    // Determine the next project based on the arrow key pressed
    const nextProjectIndex = event.key === 'ArrowRight' ? currentProjectIndex + 1 : currentProjectIndex - 1;
    const nextProject = projects[nextProjectIndex];

    if (!nextProject) return;

    // Get project info and filter tasks
    const { expandAccepted } = (workspaces[workspace.id] && workspaces[workspace.id][nextProject.id]) || defaultColumnValues;
    const filteredTasks = tasks.filter((t) => t.projectId === nextProject.id);

    const [firstTask] = sortAndGetCounts(filteredTasks, expandAccepted, false).filteredTasks;
    if (!firstTask) return;

    // Set focus on the first task of the project
    setTaskCardFocus(firstTask.id);
  };

  const setTaskState = (taskId: string, state: TaskStates) => {
    setTasksState((prevState) => ({
      ...prevState,
      [taskId]: state,
    }));
  };

  const handleEscKeyPress = () => {
    if (!focusedTaskId) return;

    // check if creation of subtask open
    const subtaskCreation = !!document.getElementById('create-subtask');
    if (subtaskCreation) return;

    // check if creation of subtask open or  some of the subtasks editing
    const subtasksEditing = document.querySelectorAll(`[id^="blocknote-subtask-"]`);
    if (subtasksEditing.length) return dispatchCustomEvent('changeSubtaskState', { taskId: focusedTaskId, state: 'removeEditing' });

    const taskState = tasksState[focusedTaskId];
    if (!taskState || taskState === 'folded') {
      // check if creation of task open
      const taskCreation = document.getElementById(`create-task-${currentTask.projectId}`);
      if (taskCreation) {
        changeColumn(workspace.id, currentTask.projectId, {
          createTaskForm: false,
        });
        return;
      }
    }
    if (taskState === 'editing' || taskState === 'unsaved') return setTaskState(focusedTaskId, 'expanded');
    if (taskState === 'expanded') return setTaskState(focusedTaskId, 'folded');
  };

  const handleEnterKeyPress = () => {
    if (!focusedTaskId) return;
    const taskState = tasksState[focusedTaskId];
    if (!taskState || taskState === 'folded') setTaskState(focusedTaskId, 'expanded');
    if (taskState === 'expanded') setTaskState(focusedTaskId, 'editing');
  };

  const handleNKeyDown = async () => {
    if (!projects.length) return;
    const focusedTask = tasks.find((t) => t.id === focusedTaskId);
    const project = projects.find((p) => p.id === focusedTask?.projectId);
    const projectId = project?.id ?? projects[0].id;
    const projectSettings = workspaces[workspace.id]?.[projectId];
    changeColumn(workspace.id, projectId, {
      createTaskForm: !projectSettings.createTaskForm,
    });
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
    ['A', () => hotKeyPress(`assignedTo-${focusedTaskId}`)],
    ['I', () => hotKeyPress(`impact-${focusedTaskId}`)],
    ['L', () => hotKeyPress(`labels-${focusedTaskId}`)],
    ['S', () => hotKeyPress(`status-${focusedTaskId}`)],
    ['T', () => hotKeyPress(`type-${focusedTaskId}`)],
  ]);

  const handleToggleTaskSelect = (event: TaskCardToggleSelectEvent) => {
    const { selected, taskId } = event.detail;
    if (selected) return setSelectedTasks([...selectedTasks, taskId]);
    return setSelectedTasks(selectedTasks.filter((id) => id !== taskId));
  };

  const handleEntityUpdate = (event: { detail: { membership: Membership; entity: ContextEntity } }) => {
    const { entity, membership } = event.detail;
    if (entity === 'project') updateProjectMembership(membership);
    if (entity === 'workspace') updateWorkspaceMembership(membership);
  };

  const handleTaskState = (event: TaskStatesChangeEvent) => {
    const { taskId, state, sheet } = event.detail;
    if (sheet) return;
    if (state === 'currentState') return setTaskState(taskId, tasksState[taskId] === 'folded' ? 'folded' : 'expanded');
    setTaskState(taskId, state);
  };

  useEventListener('menuEntityChange', handleEntityUpdate);
  useEventListener('changeTaskState', handleTaskState);
  useEventListener('toggleSelectTask', handleToggleTaskSelect);

  useEffect(() => {
    const { current: prevFocused } = prevFocusedRef;

    // Prevent state change if the focused task hasn't changed
    if (prevFocused === focusedTaskId) return;

    // Check if the previously focused task exists
    if (prevFocused) {
      const currentState = tasksState[prevFocused];
      const newState = currentState === 'folded' || !currentState ? 'folded' : 'expanded';

      setTimeout(() => setTaskState(prevFocused, newState), 0);
      // Fold the subtasks of the previously focused task
      dispatchCustomEvent('changeSubtaskState', { taskId: prevFocused, state: 'folded' });
    }

    // Update the previous focused task ID
    prevFocusedRef.current = focusedTaskId;
  }, [focusedTaskId, tasksState, setTaskState]);

  useEffect(() => {
    if (q?.length) setSearchQuery(q);
  }, []);

  return (
    <>
      <BoardHeader>
        <WorkspaceActions project={mobileDeviceProject} />
      </BoardHeader>
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
                className="max-md:hidden absolute scale-x-0 scale-y-75 -rotate-180 text-primary top-4 right-20 lg:right-36 translate-y-20 opacity-0 duration-500 delay-500 transition-all group-hover/workspace:opacity-100 group-hover/workspace:scale-x-100 group-hover/workspace:translate-y-0 group-hover/workspace:rotate-[-130deg]"
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
            <BoardColumn tasksState={tasksState} project={mobileDeviceProject} settings={workspaces[workspace.id]?.[mobileDeviceProject.id]} />
          ) : (
            <BoardDesktop tasksState={tasksState} projects={projects} workspaceId={workspace.id} />
          )}
        </>
      )}
    </>
  );
}
