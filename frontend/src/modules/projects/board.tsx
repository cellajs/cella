import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { Fragment, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { sortTaskOrder } from '~/lib/utils';
import { useWorkspaceStore } from '~/store/workspace';
import type { Project } from '~/types';
import type { Label, Task } from '../common/electric/electrify';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../ui/resizable';
import { WorkspaceContext } from '../workspaces';
import { BoardColumn } from './board-column';
import { taskStatuses } from './select-status';

interface ProjectContextValue {
  project: Project;
  labels: Label[];
  focusedProject: number | null;
  setFocusedProjectIndex: (index: number) => void;
}

export const ProjectContext = createContext({} as ProjectContextValue);

export default function Board() {
  const { workspaces, getWorkspaceViewOptions } = useWorkspaceStore();
  const { projects, labels, tasks, searchQuery, workspace } = useContext(WorkspaceContext);
  const [focusedProjectIndex, setFocusedProjectIndex] = useState<number | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [viewOptions, setViewOptions] = useState(getWorkspaceViewOptions(workspace.id));

  const handleTaskClick = (taskId: string) => {
    setFocusedTaskId(taskId);
  };

  const filteredTasks = useMemo(() => {
    if (!searchQuery) return tasks;
    return tasks.filter(
      (task) =>
        task.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.markdown?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.slug.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [searchQuery, tasks]);

  const filteredByViewOptionsTasks = useMemo(() => {
    return filteredTasks.filter(
      (task) =>
        viewOptions.type.includes(task.type) &&
        (task.status === 0 || task.status === 6 || viewOptions.status.includes(taskStatuses[task.status].status)),
      // add to task label status and filter by status of label too
    );
  }, [viewOptions, filteredTasks]);

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
    setViewOptions(workspaces[workspace.id].viewOptions);
  }, [workspaces[workspace.id].viewOptions]);

  useEffect(() => {
    return combine(
      monitorForElements({
        canMonitor({ source }) {
          return source.data.type === 'column' || source.data.type === 'task';
        },
        onDrop({ location, source }) {
          if (!location.current.dropTargets.length) return;

          if (source.data.type === 'column') {
            //TODO Dragging a column
          }

          // Dragging a task
          if (source.data.type === 'task') {
            const sourceTask = source.data.item as Task;
            const sourceProjectId = sourceTask.project_id;

            const [destinationTask] = location.current.dropTargets;
            const destinationItem = destinationTask.data.item as Task;
            const destinationProjectId = destinationItem.project_id;

            // reordering in same project
            if (sourceProjectId === destinationProjectId) {
              return;
            }
            // moving to a new project
            return;
          }
        },
      }),
    );
  }, []);

  return (
    <div className="h-[calc(100vh-64px-64px)] transition md:h-[calc(100vh-88px)]">
      <ResizablePanelGroup direction="horizontal" className="flex gap-2 group/board" id="project-panels">
        {projects.map((project, index) => (
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
                  tasks={filteredByViewOptionsTasks.filter((t) => t.project_id === project.id)}
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
