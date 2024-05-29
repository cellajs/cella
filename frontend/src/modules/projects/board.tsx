import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { Fragment, createContext, useContext, useEffect, useState } from 'react';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { arrayMove, getReorderDestinationIndex, sortById, sortTaskOrder } from '~/lib/utils';
import { useWorkspaceStore } from '~/store/workspace';
import type { Project } from '~/types';
import type { Label } from '../common/electric/electrify';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../ui/resizable';
import { WorkspaceContext } from '../workspaces';
import { BoardColumn, isProjectData } from './board-column';
import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { isTaskData } from './draggable-task-card';
import { useNavigationStore } from '~/store/navigation';

interface ProjectContextValue {
  project: Project;
  labels: Label[];
  focusedProject: number | null;
  setFocusedProjectIndex: (index: number) => void;
}

export const ProjectContext = createContext({} as ProjectContextValue);

export default function Board() {
  const { workspaces } = useWorkspaceStore();
  const { projects, tasks, labels, workspace } = useContext(WorkspaceContext);

  const [focusedProjectIndex, setFocusedProjectIndex] = useState<number | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const { submenuItemsOrder, setSubmenuItemsOrder } = useNavigationStore();
  const [mappedProjects, setMappedProjects] = useState<Project[]>(
    projects.filter((p) => !p.archived).sort((a, b) => sortById(a.id, b.id, submenuItemsOrder[workspace.id])),
  );

  const handleTaskClick = (taskId: string) => {
    setFocusedTaskId(taskId);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!tasks.length || !projects.length) return;
    const currentIndex = focusedProjectIndex !== null ? focusedProjectIndex : -1;
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = currentIndex === projects.length - 1 ? 0 : currentIndex + 1;
    if (event.key === 'ArrowLeft') nextIndex = currentIndex <= 0 ? projects.length - 1 : currentIndex - 1;
    const indexedProject = projects[nextIndex];
    const currentProjectSettings = workspaces[indexedProject.workspaceId]?.columns.find((el) => el.columnId === indexedProject.id);
    const sortedProjectTasks = tasks.filter((t) => t.project_id === indexedProject.id).sort((a, b) => sortTaskOrder(a, b));
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

  useEffect(() => {
    setMappedProjects(projects.filter((p) => !p.archived).sort((a, b) => sortById(a.id, b.id, submenuItemsOrder[workspace.id])));
  }, [submenuItemsOrder[workspace.id]]);

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
            const destination = getReorderDestinationIndex(sourceData.index, closestEdgeOfTarget, target.data.index, 'horizontal');
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
              console.log('ChangeIndex');
            }
          }
        },
      }),
    );
  }, [submenuItemsOrder[workspace.id]]);

  return (
    <div className="h-[calc(100vh-64px-64px)] transition md:h-[calc(100vh-88px)]">
      <ResizablePanelGroup direction="horizontal" className="flex gap-2 group/board" id="project-panels">
        {mappedProjects.map((project, index) => (
          <Fragment key={project.id}>
            <ResizablePanel key={`${project.id}-panel`}>
              <ProjectContext.Provider
                value={{
                  project,
                  labels: labels.filter((l) => l.project_id === project.id),
                  focusedProject: focusedProjectIndex,
                  setFocusedProjectIndex,
                }}
              >
                <BoardColumn
                  tasks={tasks.filter((t) => t.project_id === project.id)}
                  key={`${project.id}-column`}
                  setFocusedTask={(taskId: string) => handleTaskClick(taskId)}
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
  );
}
