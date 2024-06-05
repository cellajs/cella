import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { Fragment, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { arrayMove, getReorderDestinationIndex, sortById, sortTaskOrder } from '~/lib/utils';
import { useWorkspaceStore } from '~/store/workspace';
import type { Project } from '~/types';
import { useElectric, type Label, type PreparedTask } from '../../common/electric/electrify';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../../ui/resizable';
import { WorkspaceContext } from '../../workspaces';
import { BoardColumn, isProjectData } from './board-column';
import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { isTaskData } from '../task/draggable-task-card';
import { useNavigationStore } from '~/store/navigation';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { ProjectContext } from './project-context';

const PANEL_MIN_WIDTH = 300;
// Allow resizing of panels
const EMPTY_SPACE_WIDTH = 300;

function getScrollerWidth(containerWidth: number, projectsLength: number) {
  if (containerWidth === 0) return '100%';
  return containerWidth / projectsLength > PANEL_MIN_WIDTH
    ? '100%'
    : projectsLength * PANEL_MIN_WIDTH + EMPTY_SPACE_WIDTH;
}

function BoardDesktop({
  workspaceId,
  projects,
  labels,
  tasks,
  onTaskClick,
  focusedProjectIndex,
  setFocusedProjectIndex,
  focusedTaskId,
}: {
  workspaceId: string;
  projects: Project[];
  labels: Label[];
  tasks: PreparedTask[];
  onTaskClick: (taskId: string) => void;
  focusedProjectIndex: number | null;
  setFocusedProjectIndex: (index: number) => void;
  focusedTaskId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(() => containerRef.current?.clientWidth ?? 0);
  const scrollerWidth = getScrollerWidth(containerWidth, projects.length);
  const panelMinSize =
    typeof scrollerWidth === 'number' ? (PANEL_MIN_WIDTH / scrollerWidth) * 100 : 100 / (projects.length + 1); // + 1 so that the panel can be resized to be bigger or smaller

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="h-[calc(100vh-64px-64px)] transition md:h-[calc(100vh-88px)] overflow-x-auto" ref={containerRef}>
      <div className="h-[inherit]" style={{ width: scrollerWidth }}>
        <ResizablePanelGroup
          direction="horizontal"
          className="flex gap-2 group/board"
          id="project-panels"
          autoSaveId={workspaceId}
        >
          {projects.map((project, index) => (
            <Fragment key={project.id}>
              <ResizablePanel key={project.id} id={project.id} order={index} minSize={panelMinSize}>
                <ProjectContext.Provider
                  value={{
                    project,
                    labels: labels.filter((l) => l.project_id === project.id),
                    focusedProject: focusedProjectIndex,
                    setFocusedProjectIndex,
                  }}
                >
                  <BoardColumn
                    key={project.id}
                    tasks={tasks.filter((t) => t.project_id === project.id)}
                    setFocusedTask={(taskId: string) => onTaskClick(taskId)}
                    focusedTask={focusedTaskId}
                  />
                </ProjectContext.Provider>
              </ResizablePanel>
              {projects.length > index + 1 && (
                <ResizableHandle className="w-[6px] rounded border border-background -mx-[7px] bg-transparent hover:bg-primary/50 data-[resize-handle-state=drag]:bg-primary transition-all" />
              )}
            </Fragment>
          ))}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

export default function Board() {
  const { workspaces } = useWorkspaceStore();
  const { workspace, projects, tasks, labels } = useContext(WorkspaceContext);

  const [focusedProjectIndex, setFocusedProjectIndex] = useState<number | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const { submenuItemsOrder, setSubmenuItemsOrder, menu } = useNavigationStore();
  const [mappedProjects, setMappedProjects] = useState<Project[]>(
    projects.filter((p) => !p.archived).sort((a, b) => sortById(a.id, b.id, submenuItemsOrder[workspace.id])),
  );
  const isDesktopLayout = useBreakpoints('min', 'sm');

  const electric = useElectric();

  const handleTaskClick = (taskId: string) => {
    setFocusedTaskId(taskId);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!tasks.length || !mappedProjects.length) return;
    const currentIndex = focusedProjectIndex !== null ? focusedProjectIndex : -1;
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = currentIndex === mappedProjects.length - 1 ? 0 : currentIndex + 1;
    if (event.key === 'ArrowLeft') nextIndex = currentIndex <= 0 ? mappedProjects.length - 1 : currentIndex - 1;
    const indexedProject = mappedProjects[nextIndex];
    const currentProjectSettings = workspaces[indexedProject.workspaceId]?.columns.find(
      (el) => el.columnId === indexedProject.id,
    );
    const sortedProjectTasks = tasks
      .filter((t) => t.project_id === indexedProject.id)
      .sort((a, b) => sortTaskOrder(a, b));
    const lengthWithoutAccepted = sortedProjectTasks.filter((t) => t.status !== 6).length;

    setFocusedProjectIndex(nextIndex);
    if (!sortedProjectTasks.length) {
      setFocusedTaskId(null);
    } else {
      const startIndex = currentProjectSettings?.expandAccepted ? 0 : sortedProjectTasks.length - lengthWithoutAccepted;
      setFocusedTaskId(sortedProjectTasks[startIndex].id);
    }
  };

  useHotkeys([
    ['ArrowRight', handleKeyDown],
    ['ArrowLeft', handleKeyDown],
  ]);

  const currentWorkspace = useMemo(() => {
    return menu.workspaces.items.find((w) => w.id === workspace.id);
  }, [menu.workspaces.items, workspace.id]);

  useEffect(() => {
    //Fix types
    if (currentWorkspace) {
      const currentActiveProjects = currentWorkspace.submenu?.items.filter((p) => !p.archived) as unknown as Project[];
      if (!currentActiveProjects) return setMappedProjects(projects);
      setMappedProjects(currentActiveProjects.sort((a, b) => sortById(a.id, b.id, submenuItemsOrder[workspace.id])));
    }
  }, [currentWorkspace, submenuItemsOrder, workspace.id]);

  useEffect(() => {
    return combine(
      monitorForElements({
        canMonitor({ source }) {
          return source.data.type === 'column' || source.data.type === 'task';
        },
        onDrop({ location, source }) {
          const target = location.current.dropTargets[0];
          const sourceData = source.data;
          if (!target) return;

          // Drag a column
          if (isProjectData(sourceData) && isProjectData(target.data)) {
            const closestEdgeOfTarget: Edge | null = extractClosestEdge(target.data);
            const destination = getReorderDestinationIndex(
              sourceData.index,
              closestEdgeOfTarget,
              target.data.index,
              'horizontal',
            );
            const newItemOrder = arrayMove(submenuItemsOrder[workspace.id], sourceData.index, destination);
            setSubmenuItemsOrder(workspace.id, newItemOrder);
          }

          // Drag a task
          if (isTaskData(sourceData) && isTaskData(target.data)) {
            // Drag a task in different column
            if (sourceData.item.project_id !== target.data.item.project_id) {
              console.log('ChangeProject');
            }
            // Drag a task in same column
            if (sourceData.item.project_id === target.data.item.project_id) {
              let newOrder = 0;
              if (target.data.index > 0 && target.data.index < tasks.length - 1) {
                console.log('1');
                const itemBefore = tasks[target.data.index - 1];
                const itemAfter = tasks[target.data.index];

                newOrder = (itemBefore.sort_order + itemAfter.sort_order) / 2;
              } else if (target.data.index === 0 && tasks.length > 0) {
                console.log('2');
                const itemAfter = tasks[target.data.index];
                newOrder = itemAfter.sort_order / 1.1;
              } else if (target.data.index === tasks.length - 1 && tasks.length > 0) {
                console.log('3');
                const itemBefore = tasks[target.data.index - 1];
                newOrder = itemBefore.sort_order * 1.1;
              }

              console.log('NewOrder', newOrder, tasks);

              // Update order of dragged task
              electric?.db.tasks.update({
                data: {
                  sort_order: newOrder,
                },
                where: {
                  id: sourceData.item.id,
                },
              });
            }
          }
        },
      }),
    );
  }, [submenuItemsOrder[workspace.id], tasks]);

  if (!isDesktopLayout) {
    return (
      <div className="flex flex-col gap-4">
        {mappedProjects.map((project) => (
          <ProjectContext.Provider
            key={project.id}
            value={{
              project,
              labels: labels.filter((l) => l.project_id === project.id),
              focusedProject: focusedProjectIndex,
              setFocusedProjectIndex,
            }}
          >
            <BoardColumn
              key={project.id}
              tasks={tasks.filter((t) => t.project_id === project.id)}
              setFocusedTask={(taskId: string) => handleTaskClick(taskId)}
              focusedTask={focusedTaskId}
            />
          </ProjectContext.Provider>
        ))}
      </div>
    );
  }

  return (
    <BoardDesktop
      workspaceId={workspace.id}
      projects={mappedProjects}
      labels={labels}
      tasks={tasks}
      onTaskClick={handleTaskClick}
      focusedProjectIndex={focusedProjectIndex}
      setFocusedProjectIndex={setFocusedProjectIndex}
      focusedTaskId={focusedTaskId}
    />
  );
}
