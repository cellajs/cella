import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronDown, Palmtree, Search, Undo } from 'lucide-react';
import { type MutableRefObject, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type GetTasksParams, getTasksList } from '~/api/tasks';

import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { type ChangeMessage, ShapeStream, type ShapeStreamOptions } from '@electric-sql/client';
import { useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { toast } from 'sonner';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { queryClient } from '~/lib/router';
import { BoardColumnHeader } from '~/modules/app/board/board-column-header';
import { ColumnSkeleton } from '~/modules/app/board/column-skeleton';
import { isSubtaskData, isTaskData } from '~/modules/app/board/helpers';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { dialog } from '~/modules/common/dialoger/state';
import FocusTrap from '~/modules/common/focus-trap';
import { taskKeys, useTaskUpdateMutation } from '~/modules/common/query-client-provider/tasks';
import { sheet } from '~/modules/common/sheeter/state';
import CreateTaskForm from '~/modules/tasks/create-task-form';
import { getRelativeTaskOrder, openTaskPreviewSheet, sortAndGetCounts } from '~/modules/tasks/helpers';
import TaskCard from '~/modules/tasks/task';
import TaskSheet from '~/modules/tasks/task-sheet';
import type { TaskStates } from '~/modules/tasks/types';
import { Button } from '~/modules/ui/button';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';
import { useWorkspaceQuery } from '~/modules/workspaces/helpers/use-workspace';
import { WorkspaceBoardRoute } from '~/routes/workspaces';
import { useGeneralStore } from '~/store/general';
import { useNavigationStore } from '~/store/navigation';
import { useThemeStore } from '~/store/theme';
import { useWorkspaceStore } from '~/store/workspace';
import type { Column } from '~/store/workspace-ui';
import { defaultColumnValues, useWorkspaceUIStore } from '~/store/workspace-ui';
import type { Project, Task } from '~/types/app';
import { cn } from '~/utils/cn';
import { objectKeys } from '~/utils/object';
import ProjectActions from './project-actions';

interface BoardColumnProps {
  tasksState: Record<string, TaskStates>;
  project: Project;
  settings?: Column;
}

type RawTask = {
  id: string;
  description: string;
  keywords: string;
  expandable: boolean;
  entity: 'task';
  summary: string;
  type: 'bug' | 'feature' | 'chore';
  impact: number;
  sort_order: number;
  status: number;
  parent_id: string;
  labels: string[];
  assigned_to: string[];
  organization_id: string;
  project_id: string;
  created_at: string;
  created_by: string;
  modified_at: string;
  modified_by: string;
};

const taskShape = (projectId?: string): ShapeStreamOptions => ({
  url: new URL('/v1/shape/tasks', config.electricUrl).href,
  where: projectId ? `project_id = '${projectId}'` : undefined,
  backoffOptions: {
    initialDelay: 500,
    maxDelay: 32000,
    multiplier: 2,
  },
});

export const tasksQueryOptions = ({ projectId, orgIdOrSlug }: GetTasksParams) => {
  return queryOptions({
    queryKey: taskKeys.list({ projectId, orgIdOrSlug }),
    queryFn: async () =>
      await getTasksList({
        orgIdOrSlug,
        projectId,
      }),
  });
};

export function BoardColumn({ project, tasksState, settings }: BoardColumnProps) {
  const { t } = useTranslation();
  const { taskIdPreview } = useSearch({
    from: WorkspaceBoardRoute.id,
  });

  const defaultTaskFormRef = useRef<HTMLDivElement | null>(null);
  const columnRef = useRef<HTMLDivElement | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);

  const { menu } = useNavigationStore();
  const { mode } = useThemeStore();
  const isMobile = useBreakpoints('max', 'sm');
  const { searchQuery, selectedTasks, focusedTaskId } = useWorkspaceStore();
  const {
    data: { workspace, labels, members },
  } = useWorkspaceQuery();
  const { changeColumn } = useWorkspaceUIStore();
  const { networkMode } = useGeneralStore();
  const {
    expandIced: showIced,
    expandAccepted: showAccepted,
    minimized,
  } = useMemo(() => settings || defaultColumnValues, [settings?.expandIced, settings?.expandAccepted, settings?.minimized]);

  // Query tasks
  const { data, isLoading } = useSuspenseQuery(tasksQueryOptions({ projectId: project.id, orgIdOrSlug: project.organizationId }));

  const taskMutation = useTaskUpdateMutation();

  // Subscribe to task updates
  useEffect(() => {
    if (networkMode !== 'online' || !config.has.sync) return;

    const shapeStream = new ShapeStream<RawTask>(taskShape(project.id));
    const unsubscribe = shapeStream.subscribe((messages) => {
      const createMessage = messages.find((m) => m.headers.operation === 'insert') as ChangeMessage<RawTask> | undefined;
      if (createMessage) {
        const value = createMessage.value;
        queryClient.setQueryData(tasksQueryOptions({ projectId: project.id, orgIdOrSlug: project.organizationId }).queryKey, (data) => {
          if (!data) return;
          const createdTask = {
            subtasks: [],
          } as unknown as Task;
          // TODO: Refactor
          for (const key of objectKeys(value)) {
            if (key === 'sort_order') {
              createdTask.order = value[key];
            } else if (key === 'organization_id') {
              createdTask.organizationId = value[key];
            } else if (key === 'created_at') {
              createdTask.createdAt = value[key];
            } else if (key === 'created_by') {
              createdTask.createdBy = members.find((m) => m.id === value[key]) ?? null;
            } else if (key === 'parent_id') {
              createdTask.parentId = value[key];
            } else if (key === 'assigned_to') {
              createdTask.assignedTo = members.filter((m) => value[key].includes(m.id));
            } else if (key === 'modified_at') {
              createdTask.modifiedAt = value[key];
            } else if (key === 'modified_by') {
              createdTask.modifiedBy = members.find((m) => m.id === value[key]) ?? null;
            } else if (key === 'project_id') {
              createdTask.projectId = value[key];
            } else if (key === 'labels') {
              createdTask.labels = labels.filter((l) => value[key].includes(l.id));
            } else {
              createdTask[key] = value[key] as never;
            }
          }
          return {
            ...data,
            items: [createdTask, ...data.items],
          };
        });
      }

      const updateMessage = messages.find((m) => m.headers.operation === 'update') as ChangeMessage<RawTask> | undefined;
      if (updateMessage) {
        const value = updateMessage.value;
        queryClient.setQueryData(tasksQueryOptions({ projectId: project.id, orgIdOrSlug: project.organizationId }).queryKey, (data) => {
          if (!data) return;
          return {
            ...data,
            items: data.items.map((task) => {
              if (task.id === value.id) {
                const updatedTask = {
                  ...task,
                };
                // TODO: Refactor
                for (const key of objectKeys(value)) {
                  if (key === 'sort_order') {
                    updatedTask.order = value[key];
                  } else if (key === 'organization_id') {
                    updatedTask.organizationId = value[key];
                  } else if (key === 'created_at') {
                    updatedTask.createdAt = value[key];
                  } else if (key === 'created_by') {
                    updatedTask.createdBy = members.find((m) => m.id === value[key]) ?? null;
                  } else if (key === 'parent_id') {
                    updatedTask.parentId = value[key];
                  } else if (key === 'assigned_to') {
                    updatedTask.assignedTo = members.filter((m) => value[key].includes(m.id));
                  } else if (key === 'modified_at') {
                    updatedTask.modifiedAt = value[key];
                  } else if (key === 'modified_by') {
                    updatedTask.modifiedBy = members.find((m) => m.id === value[key]) ?? null;
                  } else if (key === 'project_id') {
                    updatedTask.projectId = value[key];
                  } else if (key === 'labels') {
                    updatedTask.labels = labels.filter((l) => value[key].includes(l.id));
                  } else {
                    updatedTask[key] = value[key] as never;
                  }
                }
                return updatedTask;
              }

              return task;
            }),
          };
        });
      }
    });
    return () => {
      unsubscribe();
    };
  }, [networkMode]);

  const { filteredTasks, acceptedCount, icedCount } = useMemo(() => {
    // Get the tasks from the data or default to an empty array
    const respTasks = data?.items || [];

    // Filter tasks based on the search query
    const filteredTasks = searchQuery.length ? respTasks.filter((t) => t.keywords.toLowerCase().includes(searchQuery.toLowerCase())) : respTasks;

    // Sort the filtered tasks and get the counts
    return sortAndGetCounts(filteredTasks, showAccepted, showIced);
  }, [data, searchQuery, showAccepted, showIced]);

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
        preventEscPress: true,
        className: 'p-0 w-auto shadow-none relative z-[104] rounded-none border-t-0 m-0 max-w-none',
        container: ref.current,
        containerBackdrop: false,
        hideClose: true,
      },
    );
    // Scroll to the element inside the ref when the dialog opens
    if (ref.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Hides underscroll elements
  // 4rem refers to the header height
  const stickyBackground = <div className="sm:hidden left-0 right-0 h-4 bg-background sticky top-0 z-30 -mt-4" />;

  useEffect(() => {
    if (!taskIdPreview) return;
    const focusedTask = filteredTasks.find((t) => t.id === taskIdPreview);
    if (!focusedTask) return;
    // to open sheet after initial sheet.remove triggers
    if (taskIdPreview) {
      if (sheet.get(`task-preview-${taskIdPreview}`)) {
        sheet.update(`task-preview-${taskIdPreview}`, { content: <TaskSheet task={focusedTask} /> });
      } else setTimeout(() => openTaskPreviewSheet(focusedTask), 0);
    }
  }, [filteredTasks, taskIdPreview]);

  useEffect(() => {
    if (isMobile && minimized) handleExpand();
  }, [minimized, isMobile]);

  useEffect(() => {
    return combine(
      monitorForElements({
        canMonitor({ source }) {
          return (isTaskData(source.data) || isSubtaskData(source.data)) && !taskIdPreview;
        },
        async onDrop({ location, source }) {
          const target = location.current.dropTargets[0];
          if (!target) return;

          const sourceData = source.data;
          const targetData = target.data;
          const isTask = isTaskData(sourceData) && isTaskData(targetData);
          const isSubtask = isSubtaskData(sourceData) && isSubtaskData(targetData);
          if (!isTask && !isSubtask) return;

          const { item: sourceItem } = sourceData;
          const { item: targetItem } = targetData;
          if (sourceItem.projectId !== project.id) return;

          const edge: Edge | null = extractClosestEdge(targetData);
          if (!edge) return;

          if (isTask) {
            const newOrder: number = getRelativeTaskOrder(edge, filteredTasks, targetData.order, sourceItem.id, sourceItem.status);
            try {
              await taskMutation.mutateAsync({
                id: sourceItem.id,
                orgIdOrSlug: workspace.organizationId,
                key: project.id !== targetItem.projectId ? 'projectId' : 'order',
                data: project.id !== targetItem.projectId ? targetItem.projectId : newOrder,
                ...(project.id !== targetItem.projectId && { order: newOrder }),
                projectId: project.id,
              });
            } catch (err) {
              return toast.error(t('common:error.reorder_resource', { resource: t('app:task') }));
            }
          }

          if (isSubtask) {
            // If parentId exists, filter for subtasks and sort accordingly
            const subtasks = filteredTasks.find((t) => t.id === targetItem.parentId)?.subtasks || [];

            const newOrder = getRelativeTaskOrder(edge, subtasks, targetData.order, sourceItem.id);
            try {
              await taskMutation.mutateAsync({
                id: sourceItem.id,
                orgIdOrSlug: workspace.organizationId,
                key: 'order',
                data: newOrder,
                projectId: sourceItem.projectId,
              });
            } catch (err) {
              return toast.error(t('common:error.reorder_resource', { resource: t('app:todo') }));
            }
          }
        },
      }),
    );
  }, [menu, data]);

  if (minimized)
    return (
      <div ref={columnRef} onClick={handleExpand} onKeyDown={() => {}} className="flex flex-col h-full max-sm:-mx-1.5 max-sm:pb-28">
        <BoardColumnHeader projectId={project.id} className="sm:p-2">
          <AvatarWrap className="max-sm:hidden h-6 w-6 text-xs" id={project.id} type="project" name={project.name} url={project.thumbnailUrl} />
        </BoardColumnHeader>
        <div className="border h-full" />
      </div>
    );

  return (
    <div ref={columnRef} className="flex flex-col h-full max-sm:-mx-1.5 max-sm:pb-28">
      <BoardColumnHeader projectId={project.id}>
        <AvatarWrap className="max-sm:hidden h-6 w-6 text-xs" id={project.id} type="project" name={project.name} url={project.thumbnailUrl} />
        <div className="truncate leading-6">{project.name}</div>
        <ProjectActions project={project} openDialog={() => openCreateTaskDialog(defaultTaskFormRef)} />
      </BoardColumnHeader>
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
              <div className="z-[104]" ref={defaultTaskFormRef} />

              <div
                data-show-iced={showIced}
                data-show-accepted={showAccepted}
                className="h-full flex flex-col group"
                id={`tasks-list-${project.id}`}
                ref={cardListRef}
              >
                {!!filteredTasks.length && (
                  <div className="flex flex-col flex-grow">
                    <Button
                      onClick={handleAcceptedClick}
                      variant="ghost"
                      disabled={!acceptedCount}
                      size="sm"
                      className="flex relative justify-start w-full rounded-none gap-1 border-b border-b-green-500/10 border-t border-t-transparent ring-inset focus-visible:ring-offset-0 bg-green-500/5 hover:bg-green-500/10 text-green-500 text-xs -mt-[.07rem]"
                    >
                      <span className="w-6 mr-1.5 text-center">{acceptedCount}</span>
                      <span>{t('app:accepted').toLowerCase()}</span>
                      {!!acceptedCount && (
                        <ChevronDown
                          size={16}
                          className="transition-transform absolute right-5 opacity-50 group-data-[show-accepted=true]:rotate-180"
                        />
                      )}
                    </Button>
                    <motion.div>
                      {filteredTasks.map((task) => {
                        return (
                          <motion.div key={task.id} layout="position" transition={{ duration: 0.3 }}>
                            <FocusTrap mainElementId={task.id} active={task.id === focusedTaskId}>
                              <TaskCard
                                task={task}
                                state={tasksState[task.id] ?? 'folded'}
                                isSelected={selectedTasks.includes(task.id)}
                                isFocused={task.id === focusedTaskId}
                                mode={mode}
                              />
                            </FocusTrap>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                    <Button
                      onClick={handleIcedClick}
                      variant="ghost"
                      disabled={!icedCount}
                      size="sm"
                      className="flex relative justify-start w-full rounded-none gap-1 ring-inset focus-visible:ring-offset-0 text-sky-500 max-sm:border-b border-b-sky-500/10 bg-sky-500/5 hover:bg-sky-500/10 text-xs -mt-[.07rem]"
                    >
                      <span className="w-6 mr-1.5 text-center">{icedCount}</span>
                      <span> {t('app:iced').toLowerCase()}</span>
                      {!!icedCount && (
                        <ChevronDown size={16} className="transition-transform absolute right-5 opacity-50 group-data-[show-iced=true]:rotate-180" />
                      )}
                    </Button>
                  </div>
                )}

                {!filteredTasks.length && !searchQuery && (
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
                {!filteredTasks.length && searchQuery && (
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
