import { Fragment, type LegacyRef, useEffect, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useMeasure } from '~/hooks/use-measure';
import type { Project, TaskCardFocusEvent } from '~/types';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../../ui/resizable';
import { BoardColumn } from './board-column';
import { Bird, Redo } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { useElectric } from '../../common/electric/electrify';
import { useHotkeys } from '~/hooks/use-hot-keys';
import BoardHeader from './header/board-header';
import { useWorkspaceStore } from '~/store/workspace';

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
  columnTaskCreate,
  toggleCreateForm,
}: {
  projects: Project[];
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
                  <BoardColumn createForm={isFormOpen} toggleCreateForm={toggleCreateForm} key={project.id} project={project} />
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
  const { workspace, projects, focusedTaskId, setFocusedTaskId } = useWorkspaceStore();

  const isDesktopLayout = useBreakpoints('min', 'sm');

  const [columnTaskCreate, setColumnTaskCreate] = useState<Record<string, boolean>>({});

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const electric = useElectric()!;

  const toggleCreateTaskForm = (itemId: string) => {
    setColumnTaskCreate((prevState) => ({
      ...prevState,
      [itemId]: !prevState[itemId],
    }));
  };

  const handleVerticalArrowKeyDown = async (event: KeyboardEvent) => {
    if (!projects.length) return;

    const focusedTask = await electric.db.tasks
      .findFirst({
        where: {
          ...(focusedTaskId
            ? { id: focusedTaskId }
            : {
                project_id: projects[0].id,
              }),
        },
      })
      .catch((e) => console.error(e));

    if (!focusedTask) return;

    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const triggeredEvent = new CustomEvent('task-change', {
      detail: {
        taskId: focusedTask.id,
        projectId: focusedTask.project_id,
        direction,
      },
    });
    document.dispatchEvent(triggeredEvent);
  };

  const handleHorizontalArrowKeyDown = async (event: KeyboardEvent) => {
    const focusedTask = await electric.db.tasks.findFirst({
      where: {
        ...(focusedTaskId
          ? { id: focusedTaskId }
          : {
              project_id: projects[0].id,
            }),
      },
    });

    if (!focusedTask) return;

    const currentProjectIndex = projects.findIndex((p) => p.id === focusedTask.project_id);

    const nextProjectIndex = event.key === 'ArrowRight' ? currentProjectIndex + 1 : currentProjectIndex - 1;
    const nextProject = projects[nextProjectIndex];

    if (!nextProject) return;

    const triggeredEvent = new CustomEvent('project-change', {
      detail: {
        projectId: nextProject.id,
      },
    });
    document.dispatchEvent(triggeredEvent);
  };

  const handleNKeyDown = async () => {
    if (!projects.length) return;

    const focusedTask = await electric.db.tasks.findFirst({
      where: {
        ...(focusedTaskId && { id: focusedTaskId }),
      },
    });

    if (!focusedTask) return;

    const projectIndex = projects.findIndex((p) => p.id === focusedTask.project_id);
    if (projectIndex === -1) return;

    toggleCreateTaskForm(projects[projectIndex].id);
  };

  useHotkeys([
    ['ArrowRight', handleHorizontalArrowKeyDown],
    ['ArrowLeft', handleHorizontalArrowKeyDown],
    ['ArrowDown', handleVerticalArrowKeyDown],
    ['ArrowUp', handleVerticalArrowKeyDown],
    ['N', handleNKeyDown],
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
      {!projects.length && (
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
      {projects.length && isDesktopLayout && (
        <BoardDesktop columnTaskCreate={columnTaskCreate} toggleCreateForm={toggleCreateTaskForm} projects={projects} workspaceId={workspace.id} />
      )}
      {projects.length && !isDesktopLayout && (
        <div className="flex flex-col gap-4">
          {projects.map((project) => {
            const isFormOpen = columnTaskCreate[project.id] || false;
            return <BoardColumn createForm={isFormOpen} toggleCreateForm={toggleCreateTaskForm} key={project.id} project={project} />;
          })}
        </div>
      )}
    </>
  );
}
