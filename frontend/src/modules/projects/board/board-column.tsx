import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { type Edge, attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import type { DropTargetRecord, ElementDragPayload } from '@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { ChevronDown, Palmtree, Search, Undo } from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { cn, getDraggableItemData, sortTaskOrder } from '~/lib/utils';
import { Button } from '~/modules/ui/button';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';
import { useWorkspaceStore } from '~/store/workspace';
import type { DraggableItemData, Project, User } from '~/types/index.ts';
import ContentPlaceholder from '../../common/content-placeholder';
import { DropIndicator } from '../../common/drop-indicator';
import type { PreparedTask } from '../../common/electric/electrify';
import { sheet } from '../../common/sheeter/state';
import { WorkspaceContext } from '../../workspaces';
import { ProjectContext } from './project-context';
import { BoardColumnHeader } from './board-column-header';
import CreateTaskForm from '../task/create-task-form';
import { DraggableTaskCard } from '../task/draggable-task-card';
import { ProjectSettings } from '../project-settings';
import { useQuery } from '@tanstack/react-query';
import { getProjectMembers } from '~/api/projects';
import { useNavigationStore } from '~/store/navigation';
import { ColumnSkeleton } from './board-column-skeleton';

interface BoardColumnProps {
  tasks: PreparedTask[];
  setFocusedTask: (taskId: string) => void;
  focusedTask: string | null;
}

interface TaskContextValue {
  task: PreparedTask;
  projectMembers: User[];
  focusedTaskId: string | null;
  setFocusedTask: (taskId: string) => void;
}

export const TaskContext = createContext({} as TaskContextValue);

type ProjectDraggableItemData = DraggableItemData<Project> & { type: 'column' };

export const isProjectData = (data: Record<string | symbol, unknown>): data is ProjectDraggableItemData => {
  return data.dragItem === true && typeof data.index === 'number';
};

export function BoardColumn({ tasks, setFocusedTask, focusedTask }: BoardColumnProps) {
  const { t } = useTranslation();
  const columnRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLButtonElement | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);
  const scrollableRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef(null);

  const [dragging, setDragging] = useState(false);
  const [isDraggedOver, setIsDraggedOver] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  const { project, focusedProject, setFocusedProjectIndex } = useContext(ProjectContext);
  const { submenuItemsOrder } = useNavigationStore();
  const { searchQuery, projects, selectedTasks, tasksLoading } = useContext(WorkspaceContext);
  const { workspaces, changeColumn } = useWorkspaceStore();
  const currentProjectSettings = workspaces[project.workspaceId]?.columns.find((el) => el.columnId === project.id);

  const { data: members } = useQuery({
    queryKey: ['projects', 'members', project.id],
    queryFn: () => getProjectMembers(project.id).then((data) => data.items),
    initialData: [],
  });

  const acceptedCount = useMemo(() => tasks?.filter((t) => t.status === 6).length, [tasks]);
  const icedCount = useMemo(() => tasks?.filter((t) => t.status === 0).length, [tasks]);
  const sortedTasks = useMemo(() => tasks?.sort((a, b) => sortTaskOrder(a, b)), [tasks]);

  const [showIced, setShowIced] = useState(currentProjectSettings?.expandIced || false);
  const [showAccepted, setShowAccepted] = useState(currentProjectSettings?.expandAccepted || false);
  const [createForm, setCreateForm] = useState(false);

  const handleIcedClick = () => {
    setShowIced(!showIced);
    changeColumn(project.workspaceId, project.id, {
      expandIced: !showIced,
    });
  };
  const handleAcceptedClick = () => {
    setShowAccepted(!showAccepted);
    changeColumn(project.workspaceId, project.id, {
      expandAccepted: !showAccepted,
    });
  };

  const openSettingsSheet = () => {
    sheet(<ProjectSettings sheet project={project} />, {
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

  // const createTask = () => {
  //   dialog(<CreateTaskForm project={project} dialog />, {
  //     className: 'md:max-w-xl',
  //     title: t('common:create_task'),
  //   });
  // };

  const handleArrowKeyDown = (event: KeyboardEvent) => {
    if (focusedProject === null) setFocusedProjectIndex(0); // if user starts with Arrow Down or Up, set focusProject on index 0
    if (projects[focusedProject || 0].id !== project.id) return;

    let filteredTasks = sortedTasks;

    if (!showAccepted) filteredTasks = filteredTasks.filter((t) => t.status !== 6); // if accepted tasks hidden do not focus on them
    if (!showIced) filteredTasks = filteredTasks.filter((t) => t.status !== 0); // if iced tasks hidden do not focus on them

    const currentIndex = filteredTasks.findIndex((t) => t.id === focusedTask);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowDown') nextIndex = currentIndex === filteredTasks.length - 1 ? 0 : currentIndex + 1;
    if (event.key === 'ArrowUp') nextIndex = currentIndex === 0 ? filteredTasks.length - 1 : currentIndex - 1;

    // Ensure there are tasks in the filtered list before setting focused task
    if (filteredTasks.length > 0) {
      setFocusedTask(filteredTasks[nextIndex].id); // Set the focused task id
    }
  };

  const handlePlusKeyDown = () => {
    if (focusedProject === null) setFocusedProjectIndex(0);
    if (projects[focusedProject || 0].id !== project.id) return;
    setCreateForm(!createForm);
  };

  useHotkeys([
    ['ArrowDown', handleArrowKeyDown],
    ['ArrowUp', handleArrowKeyDown],
    ['+', handlePlusKeyDown],
  ]);

  // create draggable & dropTarget elements and auto scroll
  useEffect(() => {
    const column = columnRef.current;
    const headerDragButton = headerRef.current;
    const cardList = cardListRef.current;
    const scrollable = scrollableRef.current;

    const data = getDraggableItemData<Project>(
      project,
      submenuItemsOrder[project.workspaceId].findIndex((el) => el === project.id),
      'column',
    );
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
  }, [project, projects, submenuItemsOrder[project.workspaceId], sortedTasks]);

  // Hides underscroll elements
  // 64px refers to the header height
  const stickyBackground = <div className="sm:hidden left-0 right-0 h-4 bg-background sticky top-[64px] z-30 -mt-4" />;

  return (
    <div
      ref={columnRef}
      className={cn(
        `h-full relative rounded-b-none max-w-full bg-transparent group/column flex flex-col flex-shrink-0 snap-center border-b
      opacity-${dragging ? '30 border-primary' : '100'} ${isDraggedOver ? 'bg-card/20' : ''}`,
        selectedTasks.length && 'is-selected',
      )}
    >
      {stickyBackground}

      <BoardColumnHeader dragRef={headerRef} createFormClick={handleTaskFormClick} openSettings={openSettingsSheet} createFormOpen={createForm} />

      <div className="h-full border-l border-r">
        {createForm && <CreateTaskForm onCloseForm={() => setCreateForm(false)} />}

        <div ref={containerRef} />

        {tasksLoading ? (
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
                    {sortedTasks
                      .filter((t) => {
                        if (showAccepted && t.status === 6) return true;
                        if (showIced && t.status === 0) return true;
                        return t.status !== 0 && t.status !== 6;
                      })
                      .map((task) => (
                        <TaskContext.Provider key={task.id} value={{ task, projectMembers: members, focusedTaskId: focusedTask, setFocusedTask }}>
                          <DraggableTaskCard taskIndex={sortedTasks.findIndex((t) => t.id === task.id)} />
                        </TaskContext.Provider>
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
                      {!!icedCount && <ChevronDown size={16} className={`transition-transform opacity-50 ${showIced ? 'rotate-180' : 'rotate-0'}`} />}
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
            {closestEdge && <DropIndicator className="w-[2px]" edge={closestEdge} />}
          </>
        )}
      </div>
    </div>
  );
}
