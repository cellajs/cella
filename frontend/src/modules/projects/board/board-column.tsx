import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { type Edge, attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import type { DropTargetRecord, ElementDragPayload } from '@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'electric-sql/react';
import { ChevronDown, Palmtree, Search, Undo } from 'lucide-react';
import { lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMembers } from '~/api/general';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { cn, getDraggableItemData, sortTaskOrder, findMembershipOrderById, getReorderDestinationOrder } from '~/lib/utils';
import { Button } from '~/modules/ui/button';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';
import { useWorkspaceContext } from '~/modules/workspaces/workspace-context';
import { useNavigationStore } from '~/store/navigation';
import { useWorkspaceStore } from '~/store/workspace';
import type { DraggableItemData, Project } from '~/types/index.ts';
import ContentPlaceholder from '../../common/content-placeholder';
import { DropIndicator } from '../../common/drop-indicator';
import { type Label, type Task, useElectric } from '../../common/electric/electrify';
import { sheet } from '../../common/sheeter/state';
import CreateTaskForm from '../task/create-task-form';
import { DraggableTaskCard, isTaskData } from '../task/draggable-task-card';
import { TaskProvider } from '../task/task-context';
import { taskStatuses } from '../task/task-selectors/select-status';
import { BoardColumnHeader } from './board-column-header';
import { ColumnSkeleton } from './board-column-skeleton';
import { ProjectProvider } from './project-context';
import { ProjectSettings } from '../project-settings';
import { SheetNav } from '~/modules/common/sheet-nav';
import { WorkspaceRoute } from '~/routes/workspaces';

const MembersTable = lazy(() => import('~/modules/organizations/members-table'));

interface BoardColumnProps {
  project: Project;
}

type ProjectDraggableItemData = DraggableItemData<Project> & { type: 'column' };

export const isProjectData = (data: Record<string | symbol, unknown>): data is ProjectDraggableItemData => {
  return data.dragItem === true && typeof data.order === 'number';
};

export function BoardColumn({ project }: BoardColumnProps) {
  const { t } = useTranslation();

  const columnRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLButtonElement | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);
  const scrollableRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef(null);

  const [dragging, setDragging] = useState(false);
  const [isDraggedOver, setIsDraggedOver] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  const { menu } = useNavigationStore();
  const { workspace, searchQuery, selectedTasks, projects, focusedProjectIndex, setFocusedProjectIndex, focusedTaskId, setFocusedTaskId } =
    useWorkspaceContext(
      ({ workspace, searchQuery, selectedTasks, projects, focusedProjectIndex, setFocusedProjectIndex, focusedTaskId, setFocusedTaskId }) => ({
        workspace,
        searchQuery,
        selectedTasks,
        projects,
        focusedProjectIndex,
        setFocusedProjectIndex,
        focusedTaskId,
        setFocusedTaskId,
      }),
    );
  const { workspaces, changeColumn, getWorkspaceViewOptions } = useWorkspaceStore();
  const currentProjectSettings = workspaces[workspace.id]?.columns.find((el) => el.columnId === project.id);

  const [showIced, setShowIced] = useState(currentProjectSettings?.expandIced || false);
  const [showAccepted, setShowAccepted] = useState(currentProjectSettings?.expandAccepted || false);
  const [createForm, setCreateForm] = useState(false);
  const [viewOptions, setViewOptions] = useState(getWorkspaceViewOptions(workspace.id));

  const { data: members } = useQuery({
    queryKey: ['projects', 'members', project.id],
    queryFn: () => getMembers({ idOrSlug: project.id, entityType: 'PROJECT' }).then((data) => data.items),
    initialData: [],
  });

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const electric = useElectric()!;

  const { results: tasks = [], updatedAt } = useLiveQuery(
    electric.db.tasks.liveMany({
      where: {
        project_id: project.id,
      },
      orderBy: {
        sort_order: 'asc',
      },
    }),
  ) as {
    results: Task[] | undefined;
    updatedAt: Date | undefined;
  };

  const { results: labels = [] } = useLiveQuery(
    electric.db.labels.liveMany({
      where: {
        project_id: project.id,
      },
    }),
  ) as {
    results: Label[] | undefined;
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

  const acceptedCount = useMemo(
    () => filteredByViewOptionsTasks.filter((t) => !t.parent_id && t.status === 6).length || 0,
    [filteredByViewOptionsTasks],
  );
  const icedCount = useMemo(() => filteredByViewOptionsTasks.filter((t) => t.status === 0).length || 0, [filteredByViewOptionsTasks]);
  const sortedTasks = useMemo(() => filteredByViewOptionsTasks.sort((a, b) => sortTaskOrder(a, b)) || [], [filteredByViewOptionsTasks]);

  const showingTasks = useMemo(() => {
    const filteredByStatus = sortedTasks.filter((t) => {
      if (showAccepted && t.status === 6) return true;
      if (showIced && t.status === 0) return true;
      return t.status !== 0 && t.status !== 6;
    });
    return filteredByStatus.filter((t) => !t.parent_id);
  }, [showAccepted, showIced, sortedTasks]);

  const handleIcedClick = () => {
    setShowIced(!showIced);
    changeColumn(workspace.id, project.id, {
      expandIced: !showIced,
    });
  };
  const handleAcceptedClick = () => {
    setShowAccepted(!showAccepted);
    changeColumn(workspace.id, project.id, {
      expandAccepted: !showAccepted,
    });
  };

  const openSettingsSheet = () => {
    const projectTabs = [
      { id: 'general', label: 'common:general', element: <ProjectSettings project={project} sheet /> },
      {
        id: 'members',
        label: 'common:members',
        element: <MembersTable entity={project} isSheet={true} route={WorkspaceRoute.id} />,
      },
    ];

    sheet(<SheetNav tabs={projectTabs} />, {
      className: 'sm:max-w-[52rem]',
      title: t('common:project_settings'),
      text: t('common:project_settings.text'),
      id: 'edit-project',
    });
  };

  const handleTaskFormClick = () => {
    if (!createForm) {
      const container = document.getElementById(`${project.id}-viewport`);
      container?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setCreateForm(!createForm);
  };

  const dragIsOver = () => {
    setClosestEdge(null);
    setIsDraggedOver(false);
  };

  const dragStarted = ({ self, source }: { source: ElementDragPayload; self: DropTargetRecord }) => {
    setIsDraggedOver(true);
    if (!isProjectData(source.data) || !isProjectData(self.data) || source.data.item.id === project.id) return;
    setClosestEdge(extractClosestEdge(self.data));
  };

  const handleArrowKeyDown = (event: KeyboardEvent) => {
    if (focusedProjectIndex === null) setFocusedProjectIndex(0); // if user starts with Arrow Down or Up, set focusProject on index 0
    if (projects[focusedProjectIndex || 0].id !== project.id) return;

    let filteredTasks = sortedTasks;

    if (!showAccepted) filteredTasks = filteredTasks.filter((t) => t.status !== 6); // if accepted tasks hidden do not focus on them
    if (!showIced) filteredTasks = filteredTasks.filter((t) => t.status !== 0); // if iced tasks hidden do not focus on them

    const currentIndex = filteredTasks.findIndex((t) => t.id === focusedTaskId);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowDown') nextIndex = currentIndex === filteredTasks.length - 1 ? 0 : currentIndex + 1;
    if (event.key === 'ArrowUp') nextIndex = currentIndex === 0 ? filteredTasks.length - 1 : currentIndex - 1;

    // Ensure there are tasks in the filtered list before setting focused task
    if (filteredTasks.length > 0) {
      setFocusedTaskId(filteredTasks[nextIndex].id); // Set the focused task id
    }
  };

  const handlePlusKeyDown = () => {
    if (focusedProjectIndex === null) setFocusedProjectIndex(0);
    if (projects[focusedProjectIndex || 0].id !== project.id) return;
    setCreateForm(!createForm);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!filteredByViewOptionsTasks.length) return;
    const currentIndex = focusedProjectIndex !== null ? focusedProjectIndex : -1;
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = currentIndex === projects.length - 1 ? 0 : currentIndex + 1;
    if (event.key === 'ArrowLeft') nextIndex = currentIndex <= 0 ? projects.length - 1 : currentIndex - 1;
    const indexedProject = projects[nextIndex];
    const currentProjectSettings = workspaces[workspace.id]?.columns.find((el) => el.columnId === indexedProject.id);
    const sortedProjectTasks = filteredByViewOptionsTasks.filter((t) => t.project_id === indexedProject.id).sort((a, b) => sortTaskOrder(a, b));
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
    ['ArrowDown', handleArrowKeyDown],
    ['ArrowUp', handleArrowKeyDown],
    ['+', handlePlusKeyDown],
  ]);

  useEffect(() => {
    if (workspaces[workspace.id].viewOptions) setViewOptions(workspaces[workspace.id].viewOptions);
  }, [workspaces[workspace.id]]);

  // create draggable & dropTarget elements and auto scroll
  useEffect(() => {
    const column = columnRef.current;
    const headerDragButton = headerRef.current;
    const cardList = cardListRef.current;
    const scrollable = scrollableRef.current;

    const data = getDraggableItemData<Project>(project, findMembershipOrderById(project.id), 'column', 'PROJECT');
    if (!column || !headerDragButton || !cardList) return;
    // Don't start drag if only 1 project
    if (projects.length <= 1) return;
    return combine(
      draggable({
        element: column,
        dragHandle: headerDragButton,
        getInitialData: () => data,
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element: cardList,
        getData: () => data,
        canDrop({ source }) {
          const data = source.data;
          return isProjectData(data) && data.item.id !== project.id && data.type === 'column';
        },
        getIsSticky: () => true,
        onDragEnter: ({ self, source }) => dragStarted({ self, source }),
        onDragStart: ({ self, source }) => dragStarted({ self, source }),
        onDragLeave: () => dragIsOver(),
        onDrop: () => dragIsOver(),
      }),
      dropTargetForElements({
        element: column,
        canDrop: ({ source }) => {
          const data = source.data;
          return isProjectData(data) && source.data.type === 'column';
        },
        getIsSticky: () => true,
        getData: ({ input }) => {
          return attachClosestEdge(data, {
            input,
            element: column,
            allowedEdges: ['right', 'left'],
          });
        },
        onDragEnter: ({ self, source }) => dragStarted({ self, source }),
        onDrag: ({ self, source }) => dragStarted({ self, source }),
        onDragLeave: () => dragIsOver(),
        onDrop: () => dragIsOver(),
      }),
      scrollable
        ? autoScrollForElements({
            element: scrollable,
            canScroll: ({ source }) => isProjectData(data) && source.data.type === 'column',
          })
        : () => {},
    );
  }, [project, projects, menu, sortedTasks]);

  useEffect(() => {
    return combine(
      monitorForElements({
        canMonitor({ source }) {
          return source.data.type === 'task';
        },
        onDrop({ location, source }) {
          const target = location.current.dropTargets[0];
          const sourceData = source.data;
          if (!target) return;
          const targetData = target.data;
          // Drag a task
          if (isTaskData(sourceData) && isTaskData(targetData)) {
            // Drag a task in different column
            if (sourceData.item.project_id !== targetData.item.project_id) {
              const closestEdgeOfTarget: Edge | null = extractClosestEdge(targetData);
              const newOrder = getReorderDestinationOrder(targetData.order, closestEdgeOfTarget, 'vertical', sourceData.order);
              // Update order of dragged task
              electric?.db.tasks.update({
                data: {
                  sort_order: newOrder,
                  project_id: targetData.item.project_id,
                },
                where: {
                  id: sourceData.item.id,
                },
              });
            }
            // Drag a task in same column
            if (sourceData.item.project_id === targetData.item.project_id) {
              const closestEdgeOfTarget: Edge | null = extractClosestEdge(targetData);
              const newOrder = getReorderDestinationOrder(targetData.order, closestEdgeOfTarget, 'vertical', sourceData.order);
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
  }, [menu]);

  // Hides underscroll elements
  // 64px refers to the header height
  const stickyBackground = <div className="sm:hidden left-0 right-0 h-4 bg-background sticky top-[64px] z-30 -mt-4" />;

  return (
    <ProjectProvider key={project.id} project={project} tasks={sortedTasks} labels={labels} members={members}>
      <div ref={columnRef} className="h-full">
        <BoardColumnHeader dragRef={headerRef} createFormClick={handleTaskFormClick} openSettings={openSettingsSheet} createFormOpen={createForm} />
        <div
          className={cn(
            `h-full relative rounded-b-none max-w-full bg-transparent group/column flex flex-col flex-shrink-0 snap-center border-b
          opacity-${dragging ? '30 border-primary' : '100'} ${isDraggedOver ? 'bg-card/20' : ''}`,
            selectedTasks.length && 'is-selected',
          )}
        >
          {stickyBackground}

          <div className="h-full border-l border-r">
            {createForm && <CreateTaskForm onCloseForm={() => setCreateForm(false)} />}

            <div ref={containerRef} />

            {!updatedAt ? (
              <ColumnSkeleton />
            ) : (
              <>
                <div className="h-full" ref={cardListRef}>
                  {!!tasks.length && (
                    <ScrollArea ref={scrollableRef} id={project.id} size="indicatorVertical" className="h-full mx-[-1px]">
                      <ScrollBar size="indicatorVertical" />
                      <div className="flex flex-col px-0">
                        <Button
                          onClick={handleAcceptedClick}
                          variant="ghost"
                          disabled={!acceptedCount}
                          size="sm"
                          className="flex justify-start w-full rounded-none gap-1 border-b border-b-green-500/10 ring-inset bg-green-500/5 hover:bg-green-500/10 text-green-500 text-sm -mt-[1px]"
                        >
                          <span className="text-xs">
                            {acceptedCount} {t('common:accepted').toLowerCase()}
                          </span>
                          {!!acceptedCount && (
                            <ChevronDown size={16} className={`transition-transform opacity-50 ${showAccepted ? 'rotate-180' : 'rotate-0'}`} />
                          )}
                        </Button>
                        {showingTasks.map((task) => (
                          <TaskProvider key={task.id} task={task}>
                            <DraggableTaskCard />
                          </TaskProvider>
                        ))}
                        <Button
                          onClick={handleIcedClick}
                          variant="ghost"
                          disabled={!icedCount}
                          size="sm"
                          className="flex justify-start w-full rounded-none gap-1 ring-inset text-sky-500 bg-sky-500/5 hover:bg-sky-500/10 text-sm -mt-[1px]"
                        >
                          <span className="text-xs">
                            {icedCount} {t('common:iced').toLowerCase()}
                          </span>
                          {!!icedCount && (
                            <ChevronDown size={16} className={`transition-transform opacity-50 ${showIced ? 'rotate-180' : 'rotate-0'}`} />
                          )}
                        </Button>
                      </div>
                    </ScrollArea>
                  )}

                  {!tasks.length && !searchQuery && (
                    <ContentPlaceholder
                      Icon={Palmtree}
                      title={t('common:no_resource_yet', { resource: t('common:tasks').toLowerCase() })}
                      text={
                        !createForm && (
                          <>
                            <Undo
                              size={200}
                              strokeWidth={0.2}
                              className="max-md:hidden absolute scale-x-0 scale-y-75 rotate-180 text-primary top-4 right-4 translate-y-20 opacity-0 duration-500 delay-500 transition-all group-hover/column:opacity-100 group-hover/column:scale-x-100 group-hover/column:translate-y-0 group-hover/column:rotate-[130deg]"
                            />
                            <p className="inline-flex gap-1 opacity-0 duration-500 transition-opacity group-hover/column:opacity-100">
                              <span>{t('common:click')}</span>
                              <span className="text-primary">{`+${t('common:task')}`}</span>
                              <span>{t('common:no_tasks.text')}</span>
                            </p>
                          </>
                        )
                      }
                    />
                  )}
                  {!tasks.length && searchQuery && (
                    <ContentPlaceholder Icon={Search} title={t('common:no_resource_found', { resource: t('common:tasks').toLowerCase() })} />
                  )}
                </div>
              </>
            )}
          </div>
          {closestEdge && <DropIndicator className="w-[2px] mp-[58px]" edge={closestEdge} />}
        </div>
      </div>
    </ProjectProvider>
  );
}
