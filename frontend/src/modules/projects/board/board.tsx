import { Fragment, type LegacyRef, useEffect, useMemo, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useMeasure } from '~/hooks/use-measure';
import { useWorkspaceContext } from '~/modules/workspaces/workspace-context';
import type { Project, TaskCardFocusEvent } from '~/types';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../../ui/resizable';
import { BoardColumn } from './board-column';
import { Bird, Redo } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { boardProjectFiltering } from '../helpers';
import { type Task, useElectric } from '../../common/electric/electrify';
import { useLiveQuery } from 'electric-sql/react';
import { taskStatuses } from '../tasks-table/status';
import { useWorkspaceStore } from '~/store/workspace';
import { useHotkeys } from '~/hooks/use-hot-keys';

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
  tasks,
  updatedAt,
  columnTaskCreate,
  toggleCreateForm,
}: {
  projects: Project[];
  workspaceId: string;
  tasks: Task[];
  updatedAt?: Date;
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
                    createForm={isFormOpen}
                    toggleCreateForm={toggleCreateForm}
                    tasks={tasks.filter((t) => t.project_id === project.id)}
                    updatedAt={updatedAt}
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
  const { workspace, searchQuery, projects, focusedTaskId, setFocusedTaskId } = useWorkspaceContext(
    ({ workspace, searchQuery, projects, focusedTaskId, setFocusedTaskId }) => ({
      workspace,
      searchQuery,
      projects,
      focusedTaskId,
      setFocusedTaskId,
    }),
  );
  const { workspaces, getWorkspaceViewOptions } = useWorkspaceStore();
  const { t } = useTranslation();
  const isDesktopLayout = useBreakpoints('min', 'sm');
  const mappedProjects = useMemo(() => boardProjectFiltering(projects), [projects]);
  const [viewOptions, setViewOptions] = useState(getWorkspaceViewOptions(workspace.id));
  const [columnTaskCreate, setColumnTaskCreate] = useState<Record<string, boolean>>({});

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const electric = useElectric()!;

  // TODO: Add debounce to searchQuery
  const { results: tasks = [], updatedAt } = useLiveQuery(
    electric.db.tasks.liveMany({
      where: {
        project_id: { in: mappedProjects.map((p) => p.id) },
        parent_id: null,
        // ...(selectedStatuses.length > 0 && {
        //   status: {
        //     in: selectedStatuses,
        //   },
        // }),
        ...(viewOptions.type.length > 0 && {
          type: {
            in: viewOptions.type,
          },
        }),
        OR: [
          {
            summary: {
              contains: searchQuery,
            },
          },
          {
            markdown: {
              contains: searchQuery,
            },
          },
        ],
        status: {
          in: [0, 6, ...viewOptions.status.map((s) => taskStatuses.find(({ status }) => status === s)?.value || 0)],
        },
      },
    }),
  ) as {
    results: Task[];
    updatedAt: Date | undefined;
  };

  const toggleCreateTaskForm = (itemId: string) => {
    setColumnTaskCreate((prevState) => ({
      ...prevState,
      [itemId]: !prevState[itemId],
    }));
  };

  const handleVerticalArrowKeyDown = (event: KeyboardEvent) => {
    if (!tasks.length || !mappedProjects.length) return;

    const focusedTask = tasks.find((t) => t.id === focusedTaskId) || tasks[0];
    const direction = (event.key === 'ArrowDown') ? 1 : -1;

    console.log('focusedTask', focusedTask.project_id, focusedTask.id, direction);

    // TODO, dispatch CustomEvent to board-column of project to find the correct task AND then scroll to it.
    // 
  };

  const handleHorizontalArrowKeyDown = (event: KeyboardEvent) => {
    if (!tasks.length || !mappedProjects.length) return;

    const focusedTask = tasks.find((t) => t.id === focusedTaskId) || tasks[0];
    const projectIndex = mappedProjects.findIndex((p) => p.id === focusedTask.project_id);

    let nextIndex = projectIndex;
    if (event.key === 'ArrowRight') nextIndex = projectIndex + 1;
    else nextIndex = projectIndex - 1;

    const nextProject = mappedProjects[nextIndex];
    if (!nextProject) return;

    console.log('go to this project and focus on first task', nextProject.id);

        // TODO, dispatch CustomEvent to board-column of project to find the FIRST task AND then scroll to it.

  };

  const handleTKeyDown = () => {
    if (!tasks.length || !mappedProjects.length) return;

    console.log('create task in focused project');
    const focusedTask = tasks.find((t) => t.id === focusedTaskId) || tasks[0];
    const projectIndex = mappedProjects.findIndex((p) => p.id === focusedTask.project_id);
    if (projectIndex === -1) return;

    toggleCreateTaskForm(mappedProjects[projectIndex].id);
  };

  useHotkeys([
    ['ArrowRight', handleHorizontalArrowKeyDown],
    ['ArrowLeft', handleHorizontalArrowKeyDown],
    ['ArrowDown', handleVerticalArrowKeyDown],
    ['ArrowUp', handleVerticalArrowKeyDown],
    ['T', handleTKeyDown],
  ]);

  useEffect(() => {
    if (workspaces[workspace.id].viewOptions) setViewOptions(workspaces[workspace.id].viewOptions);
  }, [workspaces[workspace.id]]);

  useEffect(() => {
    const handleFocus = (event: Event) => {
      const { taskId } = (event as TaskCardFocusEvent).detail;
      setFocusedTaskId(taskId);
    };

    document.addEventListener('task-card-focus', handleFocus);

    return () => {
      document.removeEventListener('task-card-focus', handleFocus);
    };
  }, []);

  if (!mappedProjects.length) {
    return (
      <ContentPlaceholder
        className=" h-[calc(100vh-4rem-4rem)] sm:h-[calc(100vh-4.88rem)]"
        Icon={Bird}
        title={t('common:no_resource_yet', { resource: t('common:projects').toLowerCase() })}
        text={
          <>
            <Redo
              size={200}
              strokeWidth={0.2}
              className="max-md:hidden absolute scale-x-0 scale-y-75 -rotate-180 text-primary top-4 left-4 translate-y-20 opacity-0 duration-500 delay-500 transition-all group-hover/workspace:opacity-100 group-hover/workspace:scale-x-100 group-hover/workspace:translate-y-0 group-hover/workspace:rotate-[-130deg]"
            />
            <p className="inline-flex gap-1 opacity-0 duration-500 transition-opacity group-hover/workspace:opacity-100">
              <span>{t('common:click')}</span>
              <span className="text-primary">{`+ ${t('common:add')}`}</span>
              <span>{t('common:no_projects.text')}</span>
            </p>
          </>
        }
      />
    );
  }

  // On desktop we render all columns in a board
  if (isDesktopLayout)
    return (
      <BoardDesktop
        columnTaskCreate={columnTaskCreate}
        toggleCreateForm={toggleCreateTaskForm}
        tasks={tasks}
        updatedAt={updatedAt}
        projects={mappedProjects}
        workspaceId={workspace.id}
      />
    );

  // On mobile we just render one column
  return (
    <div className="flex flex-col gap-4">
      {mappedProjects.map((project) => {
        const isFormOpen = columnTaskCreate[project.id] || false;
        return (
          <BoardColumn
            createForm={isFormOpen}
            toggleCreateForm={toggleCreateTaskForm}
            tasks={tasks.filter((t) => t.project_id === project.id)}
            updatedAt={updatedAt}
            key={project.id}
            project={project}
          />
        );
      })}
    </div>
  );
}
