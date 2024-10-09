import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronDown, Palmtree, Plus, Search, Undo } from 'lucide-react';
import { type MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type GetTasksParams, getTasksList } from '~/api/tasks';
import { useEventListener } from '~/hooks/use-event-listener';

import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { toast } from 'sonner';
import { updateTask } from '~/api/tasks';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dispatchCustomEvent } from '~/lib/custom-events';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { type DialogT, dialog } from '~/modules/common/dialoger/state';
import FocusTrap from '~/modules/common/focus-trap';
import { BoardColumnHeader } from '~/modules/projects/board/board-column-header';
import { ColumnSkeleton } from '~/modules/projects/board/column-skeleton';
import { isSubTaskData, isTaskData } from '~/modules/projects/board/helpers';
import CreateTaskForm from '~/modules/tasks/create-task-form';
import { getRelativeTaskOrder, sortAndGetCounts } from '~/modules/tasks/helpers';
import TaskCard from '~/modules/tasks/task';
import type { CustomEventDetailId, TaskChangeEvent, TaskStates } from '~/modules/tasks/types';
import { Button } from '~/modules/ui/button';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';
import { useWorkspaceQuery } from '~/modules/workspaces/use-workspace';
import { useNavigationStore } from '~/store/navigation';
import { useThemeStore } from '~/store/theme';
import { useWorkspaceStore } from '~/store/workspace';
import type { Column } from '~/store/workspace-ui';
import { defaultColumnValues, useWorkspaceUIStore } from '~/store/workspace-ui';
import type { Project } from '~/types/app';
import { cn } from '~/utils/cn';

interface BoardColumnProps {
  tasksState: Record<string, TaskStates>;
  project: Project;
  settings?: Column;
}

export const tasksQueryOptions = ({ projectId, orgIdOrSlug }: GetTasksParams) => {
  return queryOptions({
    queryKey: ['boardTasks', projectId],
    queryFn: async () =>
      await getTasksList({
        orgIdOrSlug,
        projectId,
      }),
  });
};

const taskVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
};

export function BoardColumn({ project, tasksState, settings }: BoardColumnProps) {
  const { t } = useTranslation();
  const defaultTaskFormRef = useRef<HTMLDivElement | null>(null);
  const afterRef = useRef<HTMLDivElement | null>(null);
  const beforeRef = useRef<HTMLDivElement | null>(null);
  const columnRef = useRef<HTMLDivElement | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);

  const { menu } = useNavigationStore();
  const { mode } = useThemeStore();
  const isMobile = useBreakpoints('max', 'sm');
  const { searchQuery, selectedTasks, focusedTaskId, setFocusedTaskId } = useWorkspaceStore();
  const {
    data: { workspace },
  } = useWorkspaceQuery();
  const { changeColumn } = useWorkspaceUIStore();

  const {
    expandIced: showIced,
    expandAccepted: showAccepted,
    minimized,
    createTaskForm,
  } = useMemo(() => settings || defaultColumnValues, [settings]);

  const [mouseX, setMouseX] = useState(0);
  const [isMouseNearTop, setIsMouseNearTop] = useState(false);
  const [isMouseNearBottom, setIsMouseNearBottom] = useState(false);

  // Query tasks
  const { data, isLoading } = useSuspenseQuery(tasksQueryOptions({ projectId: project.id, orgIdOrSlug: project.organizationId }));

  const tasks = useMemo(() => {
    const respTasks = data?.items || [];
    if (!searchQuery.length) return respTasks;
    return respTasks.filter((t) => t.keywords.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [data, searchQuery]);

  const {
    sortedTasks: showingTasks,
    acceptedCount,
    icedCount,
  } = useMemo(() => sortAndGetCounts(tasks, showAccepted, showIced), [tasks, showAccepted, showIced]);

  const firstUpstartedIndex = useMemo(() => showingTasks.findIndex((t) => t.status === 1), [showingTasks]);
  const lastUpstartedIndex = useMemo(() => showingTasks.findLastIndex((t) => t.status === 1), [showingTasks]);

  const handleMouseMove = (e: React.MouseEvent, index: number) => {
    if (index !== firstUpstartedIndex && index !== lastUpstartedIndex) return;
    const isOpenDialog = dialog.get(`create-task-form-${project.id}`);
    if (isOpenDialog && (isOpenDialog as DialogT)?.open) return;
    const target = e.currentTarget as HTMLElement;
    const { top, left } = target.getBoundingClientRect();
    const mouseY = e.clientY - top;
    const mouseX = e.clientX - left;
    // to match half button width
    setMouseX(mouseX - 30);
    // mouse in the edge of 5% of the task card
    const isNearTop = mouseY < target.offsetHeight * 0.05;
    const isNearBottom = mouseY > target.offsetHeight * 0.95;
    if (index === firstUpstartedIndex) setIsMouseNearTop(isNearTop);
    if (index === lastUpstartedIndex) setIsMouseNearBottom(isNearBottom);
  };

  const handleIcedClick = () => {
    changeColumn(workspace.id, project.id, {
      expandIced: !showIced,
    });
  };

  const handleExpand = () => {
    changeColumn(workspace.id, project.id, {
      minimized: false,
    });
  };

  const handleAcceptedClick = () => {
    changeColumn(workspace.id, project.id, {
      expandAccepted: !showAccepted,
    });
  };

  const openCreateTaskDialog = (ref: MutableRefObject<HTMLDivElement | null>, mode: 'top' | 'embed' | undefined = 'top') => {
    dialog(
      <CreateTaskForm
        projectIdOrSlug={project.id}
        tasks={showingTasks}
        dialog
        onCloseForm={() =>
          changeColumn(workspace.id, project.id, {
            createTaskForm: false,
          })
        }
        defaultValues={mode === 'embed' ? { status: 0 } : {}}
      />,
      {
        id: `create-task-form-${project.id}`,
        drawerOnMobile: false,
        ...(mode === 'embed' && { title: 'Create Iced task' }),
        className: `${mode === 'embed' ? 'p-2' : 'p-0'} w-auto shadow-none relative z-[50] rounded-none border-t-0 border-r-0  mt-0 mr-2 max-w-none`,
        container: ref.current,
        containerBackdrop: false,
        hideClose: mode === 'top',
      },
    );
    // Scroll to the element inside the ref when the dialog opens
    if (ref.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleTaskChangeEventListener = (event: TaskChangeEvent) => {
    const { taskId, direction, projectId } = event.detail;
    if (projectId !== project.id) return;
    const currentFocusedIndex = showingTasks.findIndex((t) => t.id === taskId);
    if (!showingTasks[currentFocusedIndex + direction]) return;
    const { id } = showingTasks[currentFocusedIndex + direction];
    const taskCard = document.getElementById(id);
    if (taskCard && document.activeElement !== taskCard) taskCard.focus();

    setFocusedTaskId(id);
  };

  const handleProjectChangeEventListener = (event: CustomEventDetailId) => {
    if (event.detail !== project.id) return;
    const { id } = showingTasks[0];
    const taskCard = document.getElementById(id);
    if (taskCard && document.activeElement !== taskCard) taskCard.focus();
    setFocusedTaskId(id);
  };

  useEventListener('focusedTaskChange', handleTaskChangeEventListener);
  useEventListener('focusedProjectChange', handleProjectChangeEventListener);

  // Hides underscroll elements
  // 4rem refers to the header height
  const stickyBackground = <div className="sm:hidden left-0 right-0 h-4 bg-background sticky top-0 z-30 -mt-4" />;

  useEffect(() => {
    if (!createTaskForm) {
      dialog.remove(true, `create-task-form-${project.id}`);
    } else {
      openCreateTaskDialog(defaultTaskFormRef);
    }
  }, [createTaskForm]);

  useEffect(() => {
    if (isMobile && minimized) handleExpand();
  }, [minimized, isMobile]);

  useEffect(() => {
    return combine(
      monitorForElements({
        canMonitor({ source }) {
          return isTaskData(source.data) || isSubTaskData(source.data);
        },
        async onDrop({ location, source }) {
          const target = location.current.dropTargets[0];
          if (!target) return;

          const sourceData = source.data;
          const targetData = target.data;
          const isTask = isTaskData(sourceData) && isTaskData(targetData);
          const isSubTask = isSubTaskData(sourceData) && isSubTaskData(targetData);
          if (!isTask && !isSubTask) return;

          const { item: sourceItem } = sourceData;
          const { item: targetItem } = targetData;
          if (sourceItem.projectId !== project.id) return;

          const edge: Edge | null = extractClosestEdge(targetData);
          if (!edge) return;

          if (isTask) {
            const newOrder: number = getRelativeTaskOrder(edge, showingTasks, targetData.order, sourceItem.id, undefined, sourceItem.status);
            try {
              if (project.id !== targetItem.projectId) {
                const updatedTask = await updateTask(sourceItem.id, workspace.organizationId, 'projectId', targetItem.projectId, newOrder);
                dispatchCustomEvent('taskOperation', { array: [updatedTask], action: 'delete', projectId: project.id });
                dispatchCustomEvent('taskOperation', { array: [updatedTask], action: 'create', projectId: targetItem.projectId });
              } else {
                const updatedTask = await updateTask(sourceItem.id, workspace.organizationId, 'order', newOrder);
                dispatchCustomEvent('taskOperation', { array: [updatedTask], action: 'update', projectId: project.id });
              }
            } catch (err) {
              toast.error(t('common:error.reorder_resource', { resource: t('app:todo') }));
            }
          }

          if (isSubTask) {
            const newOrder = getRelativeTaskOrder(edge, showingTasks, targetData.order, sourceItem.id, targetItem.parentId ?? undefined);
            try {
              const updatedTask = await updateTask(sourceItem.id, workspace.organizationId, 'order', newOrder);
              dispatchCustomEvent('taskOperation', { array: [updatedTask], action: 'updateSubTask', projectId: project.id });
            } catch (err) {
              toast.error(t('common:error.reorder_resource', { resource: t('app:todo') }));
            }
          }
        },
      }),
    );
  }, [menu, data]);

  if (minimized)
    return (
      <div ref={columnRef} className="flex flex-col h-full max-sm:-mx-1.5 max-sm:pb-28">
        <BoardColumnHeader project={project} />
        <div className="border h-full" onClick={handleExpand} onKeyDown={() => {}} />
      </div>
    );

  return (
    <div ref={columnRef} className="flex flex-col h-full max-sm:-mx-1.5 max-sm:pb-28">
      <BoardColumnHeader project={project} />
      <div
        className={cn(
          'flex-1 sm:h-[calc(100vh-146px)] relative rounded-b-none max-w-full bg-transparent group/column flex flex-col flex-shrink-0 snap-center sm:border-b opacity-100',
          selectedTasks.length && 'is-selected',
        )}
      >
        {stickyBackground}

        <div className="h-full sm:border-l sm:border-r">
          {isLoading ? (
            <ColumnSkeleton />
          ) : (
            <ScrollArea id={project.id} className="h-full mx-[-.07rem]">
              <ScrollBar />
              <div className="z-[250]" ref={defaultTaskFormRef} />

              <div className="h-full flex flex-col" id={`tasks-list-${project.id}`} ref={cardListRef}>
                {!!tasks.length && (
                  <div className="flex flex-col flex-grow">
                    <Button
                      onClick={handleAcceptedClick}
                      variant="ghost"
                      disabled={!acceptedCount}
                      size="sm"
                      className="flex relative justify-start w-full rounded-none gap-1 border-b border-b-green-500/10 ring-inset bg-green-500/5 hover:bg-green-500/10 text-green-500 text-xs -mt-[.07rem]"
                    >
                      <span className="w-6 mr-1.5 text-center">{acceptedCount}</span>
                      <span>{t('app:accepted').toLowerCase()}</span>
                      {!!acceptedCount && (
                        <ChevronDown
                          size={16}
                          className={`transition-transform absolute right-5 opacity-50 ${showAccepted ? 'rotate-180' : 'rotate-0'}`}
                        />
                      )}
                    </Button>
                    {showingTasks.map((task, index) => {
                      return (
                        <div key={task.id}>
                          {index === firstUpstartedIndex && <div className="z-[250]" ref={beforeRef} />}
                          <motion.div
                            variants={taskVariants}
                            initial={task.status === 6 || task.status === 0 ? 'hidden' : 'visible'}
                            animate="visible"
                            exit="exit"
                            className={cn((index === firstUpstartedIndex || index === lastUpstartedIndex) && 'group relative')}
                            onMouseMove={(e) => handleMouseMove(e, index)} // track mouse movement
                            onMouseLeave={() => {
                              setIsMouseNearTop(false);
                              setIsMouseNearBottom(false);
                            }}
                          >
                            <FocusTrap mainElementId={task.id} active={task.id === focusedTaskId}>
                              <TaskCard
                                task={task}
                                state={tasksState[task.id] ?? 'folded'}
                                isSelected={selectedTasks.includes(task.id)}
                                isFocused={task.id === focusedTaskId}
                                mode={mode}
                              />
                              {/* Conditionally render "+ Task" button for first and last task */}
                              {((index === firstUpstartedIndex && isMouseNearTop) || (index === lastUpstartedIndex && isMouseNearBottom)) && (
                                <Button
                                  id="iced-task-creation"
                                  variant="plain"
                                  size="xs"
                                  style={{ left: `${mouseX}px` }}
                                  className={`absolute bg-background hover:bg-background transform -translate-y-1/2 opacity-1 rounded hidden sm:inline-flex ${isMouseNearTop ? 'top' : 'bottom'}-2`}
                                  onClick={() => openCreateTaskDialog(isMouseNearTop ? beforeRef : afterRef, 'embed')}
                                >
                                  <Plus size={16} />
                                  <span className="ml-1">{t('app:task')}</span>
                                </Button>
                              )}
                            </FocusTrap>
                          </motion.div>
                          {index === lastUpstartedIndex && <div className="z-[250]" ref={afterRef} />}
                        </div>
                      );
                    })}
                    <Button
                      onClick={handleIcedClick}
                      variant="ghost"
                      disabled={!icedCount}
                      size="sm"
                      className="flex relative justify-start w-full rounded-none gap-1 ring-inset text-sky-500 bg-sky-500/5 hover:bg-sky-500/10 text-xs -mt-[.07rem]"
                    >
                      <span className="w-6 mr-1.5 text-center">{icedCount}</span>
                      <span> {t('app:iced').toLowerCase()}</span>
                      {!!icedCount && (
                        <ChevronDown
                          size={16}
                          className={`transition-transform absolute right-5 opacity-50 ${showIced ? 'rotate-180' : 'rotate-0'}`}
                        />
                      )}
                    </Button>
                  </div>
                )}

                {!tasks.length && !searchQuery && (
                  <ContentPlaceholder
                    Icon={Palmtree}
                    title={t('common:no_resource_yet', { resource: t('app:tasks').toLowerCase() })}
                    text={
                      <>
                        <Undo
                          size={200}
                          strokeWidth={0.2}
                          className="max-md:hidden absolute scale-x-0 scale-y-75 rotate-180 text-primary top-4 right-4 translate-y-20 opacity-0 duration-500 delay-500 transition-all group-hover/column:opacity-100 group-hover/column:scale-x-100 group-hover/column:translate-y-0 group-hover/column:rotate-[130deg]"
                        />
                        <p className="inline-flex gap-1 sm:opacity-0 duration-500 transition-opacity group-hover/column:opacity-100">
                          <span>{t('common:click')}</span>
                          <span className="text-primary">+</span>
                          <span className="max-sm:hidden text-primary">{t('app:task')}</span>
                          <span>{t('app:no_tasks.text')}</span>
                        </p>
                      </>
                    }
                  />
                )}
                {!tasks.length && searchQuery && (
                  <ContentPlaceholder Icon={Search} title={t('common:no_resource_found', { resource: t('app:tasks').toLowerCase() })} />
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
