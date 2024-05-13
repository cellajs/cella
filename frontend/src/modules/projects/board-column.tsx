import { ChevronDown, Palmtree, Search } from 'lucide-react';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';
import { useWorkspaceStore } from '~/store/workspace';
import type { ProjectWithLabels, Task } from '../common/root/electric';
import { sheet } from '../common/sheeter/state';
import { ProjectContext } from './board';
import { BoardColumnHeader } from './board-column-header';
import CreateTaskForm from './create-task-form';
import { ProjectSettings } from './project-settings';
import { TaskCard } from './task-card';
import { WorkspaceContext } from '../workspaces';
import ContentPlaceholder from '../common/content-placeholder';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { attachClosestEdge, type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { DropIndicator } from '@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/box';
import type { DraggableItemData } from '~/types/index.ts';
import { getDraggableItemData } from '~/lib/utils';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';

interface BoardColumnProps {
  tasks: Task[];
}

const sortTaskOrder = (task1: Task, task2: Task) => {
  if (task1.status !== task2.status) return task2.status - task1.status;
  // same status, sort by sort_order
  if (task1.sort_order !== null && task2.sort_order !== null) return task2.sort_order - task1.sort_order;
  // sort_order is null
  return 0;
};

type ProjectDraggableItemData = DraggableItemData<ProjectWithLabels>;

const isProjectData = (data: Record<string | symbol, unknown>): data is ProjectDraggableItemData => {
  return data.dragItem === true && typeof data.index === 'number';
};

export function BoardColumn({ tasks }: BoardColumnProps) {
  const { t } = useTranslation();
  const columnRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLButtonElement | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);
  const scrollableRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef(null);

  const [dragging, setDragging] = useState(false);
  const [isDraggedOver, setIsDraggedOver] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  const { project } = useContext(ProjectContext);
  const { searchQuery, projects } = useContext(WorkspaceContext);
  const { workspaces, changeColumn } = useWorkspaceStore();
  const currentProjectSettings = workspaces[project.workspace_id]?.columns.find((el) => el.columnId === project.id);

  const acceptedCount = useMemo(() => tasks?.filter((t) => t.status === 6).length, [tasks]);
  const icedCount = useMemo(() => tasks?.filter((t) => t.status === 0).length, [tasks]);

  const [showIced, setShowIced] = useState(currentProjectSettings?.expandIced || false);
  const [showAccepted, setShowAccepted] = useState(currentProjectSettings?.expandAccepted || false);
  const [createForm, setCreateForm] = useState(false);

  const handleIcedClick = () => {
    setShowIced(!showIced);
    changeColumn(project.workspace_id, project.id, {
      expandIced: !showIced,
    });
  };
  const handleAcceptedClick = () => {
    setShowAccepted(!showAccepted);
    changeColumn(project.workspace_id, project.id, {
      expandAccepted: !showAccepted,
    });
  };

  const openSettingsSheet = () => {
    sheet(<ProjectSettings sheet />, {
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

  const dragStarted = (data: Record<string | symbol, unknown>) => {
    setClosestEdge(extractClosestEdge(data));
    setIsDraggedOver(true);
  };

  // const createTask = () => {
  //   dialog(<CreateTaskForm project={project} dialog />, {
  //     className: 'md:max-w-xl',
  //     title: t('common:create_task'),
  //   });
  // };

  // create draggable & dropTarget elements and auto scroll
  useEffect(() => {
    const column = columnRef.current;
    const headerDragButton = headerRef.current;
    const cardList = cardListRef.current;
    const scrollable = scrollableRef.current;

    const data = getDraggableItemData<ProjectWithLabels>(
      project,
      projects.findIndex((el) => el.id === project.id),
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
        onDragEnter: ({ self }) => dragStarted(self.data),
        onDragStart: ({ self }) => dragStarted(self.data),
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
        onDragEnter: ({ self }) => dragStarted(self.data),
        onDrag: ({ self }) => dragStarted(self.data),
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
  }, [project, projects, tasks]);

  return (
    <Card
      ref={columnRef}
      className={`h-full relative rounded-b-none max-w-full bg-transparent flex flex-col flex-shrink-0 snap-center
      opacity-${dragging ? '30 border-primary' : '100'} ${isDraggedOver ? 'bg-card/20' : ''}`}
    >
      <BoardColumnHeader dragRef={headerRef} createFormClick={handleTaskFormClick} openSettings={openSettingsSheet} createFormOpen={createForm} />

      {createForm && <CreateTaskForm onCloseForm={() => setCreateForm(false)} />}

      <div ref={containerRef} />

      <div className="h-full" ref={cardListRef}>
        {!!tasks.length && (
          <ScrollArea ref={scrollableRef} id={project.id} size="indicatorVertical" className="h-full mx-[-1px]">
            <ScrollBar size="indicatorVertical" />
            <CardContent className="flex flex-grow flex-col p-0 group/column">
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
              {tasks
                .filter((t) => {
                  if (showAccepted && t.status === 6) return true;
                  if (showIced && t.status === 0) return true;
                  return t.status !== 0 && t.status !== 6;
                })
                .sort((a, b) => sortTaskOrder(a, b))
                .map((task) => (
                  <TaskCard task={task} key={task.id} />
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
            </CardContent>
          </ScrollArea>
        )}
        {!tasks.length && !searchQuery && (
          <ContentPlaceholder
            Icon={Palmtree}
            title={t('common:no_tasks')}
            text={
              <p className="inline-flex gap-1">
                <span>{t('common:click')}</span>
                <span className="text-primary">{`+ ${t('common:task')}`}</span>
                <span>{t('common:no_tasks.text')}</span>
              </p>
            }
          />
        )}
        {!tasks.length && searchQuery && <ContentPlaceholder Icon={Search} title={t('common:no_tasks_found')} />}
      </div>
      {closestEdge && <DropIndicator edge={closestEdge} />}
    </Card>
  );
}
