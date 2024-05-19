import { Fragment, createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ProjectWithLabels, Task } from '../common/root/electric';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../ui/resizable';
import { WorkspaceContext } from '../workspaces';
import { BoardColumn } from './board-column';
import { useTranslation } from 'react-i18next';
import { Bird, Redo } from 'lucide-react';
import ContentPlaceholder from '../common/content-placeholder';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { sortTaskOrder } from '~/lib/utils';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { useWorkspaceStore } from '~/store/workspace';

interface ProjectContextValue {
  project: ProjectWithLabels;
  focusedProject: number | null;
  setFocusedProjectIndex: (index: number) => void;
}

export const ProjectContext = createContext({} as ProjectContextValue);

export default function Board() {
  const { t } = useTranslation();
  const { workspaces } = useWorkspaceStore();
  const { projects, tasks, searchQuery } = useContext(WorkspaceContext);
  const [focusedProjectIndex, setFocusedProjectIndex] = useState<number | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);

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

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!tasks.length || !projects.length) return;
    const currentIndex = focusedProjectIndex !== null ? focusedProjectIndex : -1;
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = currentIndex === projects.length - 1 ? 0 : currentIndex + 1;
    if (event.key === 'ArrowLeft') nextIndex = currentIndex <= 0 ? projects.length - 1 : currentIndex - 1;
    const indexedProject = projects[nextIndex];
    const currentProjectSettings = workspaces[indexedProject.workspace_id]?.columns.find((el) => el.columnId === indexedProject.id);
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
        {!projects.length && (
          <ContentPlaceholder
            Icon={Bird}
            title={t('common:no_projects')}
            text={
              <>
                <Redo
                  size={200}
                  strokeWidth={0.2}
                  className="max-md:hidden absolute scale-x-0 scale-y-75 -rotate-180 text-primary top-4 left-4 translate-y-20 opacity-0 duration-500 delay-500 transition-all group-hover/board:opacity-100 group-hover/board:scale-x-100 group-hover/board:translate-y-0 group-hover/board:rotate-[-130deg]"
                />
                <p className="inline-flex gap-1 opacity-0 duration-500 transition-opacity group-hover/board:opacity-100">
                  <span>{t('common:click')}</span>
                  <span className="text-primary">{`+ ${t('common:add')}`}</span>
                  <span>{t('common:no_projects.text')}</span>
                </p>
              </>
            }
          />
        )}
        {projects.map((project, index) => (
          <Fragment key={project.id}>
            <ResizablePanel key={`${project.id}-panel`}>
              <ProjectContext.Provider value={{ project, focusedProject: focusedProjectIndex, setFocusedProjectIndex }}>
                <BoardColumn
                  tasks={filteredTasks.filter((t) => t.project_id === project.id)}
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
