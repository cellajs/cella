import { Fragment, type LegacyRef, useEffect, useMemo, useState, useCallback } from 'react';
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
import { useHotkeys } from '~/hooks/use-hot-keys';
import BoardHeader from './header/board-header';

const PANEL_MIN_WIDTH = 300;
// Allow resizing of panels
const EMPTY_SPACE_WIDTH = 300;

const LIMIT = 100;

export type ProjectState = {
  offset: number;
  isLoading: boolean;
  isFetching: boolean;
  tasks: Task[];
  fetchMore: () => Promise<void>;
  totalCount?: number;
};

const defaultProjectState: ProjectState = {
  offset: 0,
  isLoading: true,
  isFetching: true,
  tasks: [],
  fetchMore: async () => {},
};

function getScrollerWidth(containerWidth: number, projectsLength: number) {
  if (containerWidth === 0) return '100%';
  return containerWidth / projectsLength > PANEL_MIN_WIDTH
    ? '100%'
    : projectsLength * PANEL_MIN_WIDTH + EMPTY_SPACE_WIDTH;
}

function BoardDesktop({
  workspaceId,
  projects,
  projectStates,
  columnTaskCreate,
  toggleCreateForm,
}: {
  projects: Project[];
  projectStates: Record<string, ProjectState>;
  workspaceId: string;
  columnTaskCreate: Record<string, boolean>;
  toggleCreateForm: (projectId: string) => void;
}) {
  const { ref, bounds } = useMeasure();
  const scrollerWidth = getScrollerWidth(bounds.width, projects.length);
  const panelMinSize =
    typeof scrollerWidth === 'number' ? (PANEL_MIN_WIDTH / scrollerWidth) * 100 : 100 / (projects.length + 1); // + 1 so that the panel can be resized to be bigger or smaller

  return (
    <div
      className="transition sm:h-[calc(100vh-4rem)] md:h-[calc(100vh-4.88rem)] overflow-x-auto"
      ref={ref as LegacyRef<HTMLDivElement>}
    >
      <div className="h-[inherit]" style={{ width: scrollerWidth }}>
        <ResizablePanelGroup
          direction="horizontal"
          className="flex gap-2 group/board"
          id="project-panels"
          autoSaveId={workspaceId}
        >
          {projects.map((project, index) => {
            const isFormOpen = columnTaskCreate[project.id] || false;
            return (
              <Fragment key={project.id}>
                <ResizablePanel key={project.id} id={project.id} order={index} minSize={panelMinSize}>
                  <BoardColumn
                    createForm={isFormOpen}
                    toggleCreateForm={toggleCreateForm}
                    projectState={projectStates[project.id] || defaultProjectState}
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
  const { t } = useTranslation();
  const isDesktopLayout = useBreakpoints('min', 'sm');
  const mappedProjects = useMemo(() => boardProjectFiltering(projects), [projects]);
  const [columnTaskCreate, setColumnTaskCreate] = useState<Record<string, boolean>>({});
  const [projectStates, setProjectStates] = useState<Record<string, ProjectState>>({});

  const getQueryOptions = useCallback(
    (projectId: string, limit?: number, offset?: number) => {
      return {
        where: {
          project_id: projectId,
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
          // status: {
          //   in: [0, 6],
          // },
        },
        take: limit,
        skip: offset,
      };
    },
    [searchQuery],
  );

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const electric = useElectric()!;

  const fetchMore = useCallback(async (projectId: string, offset: number) => {
    const queryOptions = getQueryOptions(projectId, LIMIT, offset);
    const results = await electric.db.tasks.findMany({
      ...queryOptions,
    });
    setProjectStates((prevStates) => ({
      ...prevStates,
      [projectId]: {
        ...prevStates[projectId],
        isFetching: false,
        offset,
        tasks: [...prevStates[projectId].tasks, ...(results as Task[])],
        fetchMore: () => fetchMore(projectId, offset + LIMIT),
      },
    }));
  }, []);

  useEffect(() => {
    (async () => {
      for (const project of mappedProjects) {
        setProjectStates((prevState) => ({
          ...prevState,
          [project.id]: defaultProjectState,
        }));
        const queryOptions = getQueryOptions(project.id, LIMIT, 0);
        const results = await electric.db.tasks.findMany({
          ...queryOptions,
        });
        const queryOptionsCount = getQueryOptions(project.id);
        const allResults = await electric.db.tasks.findMany({
          ...queryOptionsCount,
        });
        const totalCount = allResults.length;
        setProjectStates((prevState) => ({
          ...prevState,
          [project.id]: {
            offset: 0,
            isLoading: false,
            isFetching: false,
            tasks: results as Task[],
            totalCount,
            fetchMore: () => fetchMore(project.id, LIMIT),
          },
        }));
      }
    })();
  }, [searchQuery]);

  const tasks = useMemo(
    () =>
      Object.values(projectStates).reduce((acc, state) => {
        return [...acc, ...state.tasks];
      }, [] as Task[]),
    [projectStates],
  );

  const toggleCreateTaskForm = (itemId: string) => {
    setColumnTaskCreate((prevState) => ({
      ...prevState,
      [itemId]: !prevState[itemId],
    }));
  };

  const handleVerticalArrowKeyDown = (event: KeyboardEvent) => {
    if (!tasks.length || !mappedProjects.length) return;

    const focusedTask =
      tasks.find((t) => t.id === focusedTaskId) || tasks.find((t) => t.project_id === mappedProjects[0].id) || tasks[0];
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const triggeredEvent = new CustomEvent('task-change', {
      detail: {
        taskId: focusedTask.id,
        projectId: focusedTask.project_id,
        direction,
      },
    });
    document.dispatchEvent(triggeredEvent);

    //add scroll to target
  };

  const handleHorizontalArrowKeyDown = (event: KeyboardEvent) => {
    const focusedTask =
      tasks.find((t) => t.id === focusedTaskId) || tasks.find((t) => t.project_id === mappedProjects[0].id) || tasks[0];
    const currentProjectIndex = mappedProjects.findIndex((p) => p.id === focusedTask.project_id);

    const nextProjectIndex = event.key === 'ArrowRight' ? currentProjectIndex + 1 : currentProjectIndex - 1;
    const nextProject = mappedProjects[nextProjectIndex];

    if (!nextProject) return;

    const triggeredEvent = new CustomEvent('project-change', {
      detail: {
        projectId: nextProject.id,
      },
    });
    document.dispatchEvent(triggeredEvent);
    //add scroll to target
  };

  const handleTKeyDown = () => {
    if (!tasks.length || !mappedProjects.length) return;
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
    const handleFocus = (event: Event) => {
      const { taskId } = (event as TaskCardFocusEvent).detail;
      setFocusedTaskId(taskId);
    };

    document.addEventListener('task-card-focus', handleFocus);

    return () => {
      document.removeEventListener('task-card-focus', handleFocus);
    };
  }, []);

  return (
    <>
      <BoardHeader mode="board" />
      {!mappedProjects.length && (
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
      )}
      {mappedProjects.length && isDesktopLayout && (
        <BoardDesktop
          columnTaskCreate={columnTaskCreate}
          toggleCreateForm={toggleCreateTaskForm}
          projectStates={projectStates}
          projects={mappedProjects}
          workspaceId={workspace.id}
        />
      )}
      {mappedProjects.length && !isDesktopLayout && (
        <div className="flex flex-col gap-4">
          {mappedProjects.map((project) => {
            const isFormOpen = columnTaskCreate[project.id] || false;
            return (
              <BoardColumn
                createForm={isFormOpen}
                toggleCreateForm={toggleCreateTaskForm}
                projectState={projectStates[project.id] || defaultProjectState}
                key={project.id}
                project={project}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
