import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'electric-sql/react';
import { ChevronDown, Palmtree, Search, Undo } from 'lucide-react';
import { lazy, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMembers } from '~/api/general';
import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { cn, getReorderDestinationOrder } from '~/lib/utils';
import useTaskFilters from '~/hooks/use-filtered-tasks';
import { Button } from '~/modules/ui/button';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';
import { useWorkspaceContext } from '~/modules/workspaces/workspace-context';
import { useNavigationStore } from '~/store/navigation';
import { useWorkspaceStore } from '~/store/workspace';
import type { Project } from '~/types/index.ts';
import ContentPlaceholder from '../../common/content-placeholder';
import { type Label, type Task, useElectric } from '../../common/electric/electrify';
import { sheet } from '../../common/sheeter/state';
import CreateTaskForm from '../task/create-task-form';
import { TaskCard, isTaskData } from '../task/task-card';
import { BoardColumnHeader } from './board-column-header';
import { ColumnSkeleton } from './column-skeleton';
import { ProjectSettings } from '../project-settings';
import { SheetNav } from '~/modules/common/sheet-nav';
import { WorkspaceRoute } from '~/routes/workspaces';
import { getTaskOrder } from '../task/helpers';
import { toast } from 'sonner';
import type { ProjectState } from './board';
import { useInView } from 'react-intersection-observer';

const MembersTable = lazy(() => import('~/modules/organizations/members-table'));

interface TaskChangeEvent extends Event {
  detail: {
    taskId: string;
    projectId: string;
    direction: number;
  };
}

interface ProjectChangeEvent extends Event {
  detail: {
    projectId: string;
  };
}

interface BoardColumnProps {
  projectState: ProjectState;
  setProjectState: (state: ProjectState) => void;
  project: Project;
  createForm: boolean;
  toggleCreateForm: (projectId: string) => void;
}

export function BoardColumn({ project, projectState, setProjectState, createForm, toggleCreateForm }: BoardColumnProps) {
  const { t } = useTranslation();

  const columnRef = useRef<HTMLDivElement | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);
  const scrollableRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef(null);

  const { menu } = useNavigationStore();
  const { workspace, searchQuery, selectedTasks, focusedTaskId, setSelectedTasks, setFocusedTaskId } = useWorkspaceContext(
    ({ workspace, searchQuery, selectedTasks, focusedTaskId, setSelectedTasks, setFocusedTaskId }) => ({
      workspace,
      selectedTasks,
      searchQuery,
      focusedTaskId,
      setSelectedTasks,
      setFocusedTaskId,
    }),
  );
  const { workspaces, changeColumn } = useWorkspaceStore();
  const currentProjectSettings = workspaces[workspace.id]?.columns.find((el) => el.columnId === project.id);
  const [showIced, setShowIced] = useState(currentProjectSettings?.expandIced || false);
  const [showAccepted, setShowAccepted] = useState(currentProjectSettings?.expandAccepted || false);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const { ref: measureRef, inView } = useInView({
    triggerOnce: false,
    threshold: 0,
  });

  const { tasks, isFetching, isLoading, fetchMore, totalCount } = projectState;

  const { data: members } = useQuery({
    queryKey: ['projects', 'members', project.id],
    queryFn: () => getMembers({ idOrSlug: project.id, entityType: 'PROJECT' }).then((data) => data.items),
    initialData: [],
  });

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const Electric = useElectric()!;

  const { results: labels = [] } = useLiveQuery(
    Electric.db.labels.liveMany({
      where: {
        project_id: project.id,
      },
    }),
  ) as {
    results: Label[] | undefined;
  };

  const { showingTasks, acceptedCount, icedCount } = useTaskFilters(tasks, showAccepted, showIced, labels, members);

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const handleChange = (field: keyof Task, value: any, taskId: string) => {
    if (!Electric) return toast.error(t('common:local_db_inoperable'));
    const db = Electric.db;
    if (field === 'assigned_to' && Array.isArray(value)) {
      const assignedTo = value.map((user) => user.id);
      db.tasks
        .update({
          data: {
            assigned_to: assignedTo,
          },
          where: {
            id: taskId,
          },
        })
        .then(() => {
          setProjectState({
            ...projectState,
            tasks: tasks.map((task) => {
              if (task.id === taskId) {
                return {
                  ...task,
                  assigned_to: assignedTo,
                };
              }
              return task;
            }),
          });
        });
      return;
    }

    // TODO: Review this
    if (field === 'labels' && Array.isArray(value)) {
      const labels = value.map((label) => label.id);
      db.tasks
        .update({
          data: {
            labels,
          },
          where: {
            id: taskId,
          },
        })
        .then(() => {
          setProjectState({
            ...projectState,
            tasks: tasks.map((task) => {
              if (task.id === taskId) {
                return {
                  ...task,
                  labels,
                };
              }
              return task;
            }),
          });
        });
      return;
    }
    if (field === 'status') {
      const newOrder = getTaskOrder(tasks.find((t) => t.id === taskId)?.status, value, tasks);
      db.tasks
        .update({
          data: {
            status: value,
            ...(newOrder && { sort_order: newOrder }),
          },
          where: {
            id: taskId,
          },
        })
        .then(() => {
          setProjectState({
            ...projectState,
            tasks: tasks.map((task) => {
              if (task.id === taskId) {
                return {
                  ...task,
                  status: value,
                  sort_order: newOrder,
                };
              }
              return task;
            }),
          });
        });
      return;
    }

    db.tasks
      .update({
        data: {
          [field]: value,
        },
        where: {
          id: taskId,
        },
      })
      .then(() => {
        setProjectState({
          ...projectState,
          tasks: tasks.map((task) => {
            if (task.id === taskId) {
              return {
                ...task,
                [field]: value,
              };
            }
            return task;
          }),
        });
      });
  };

  const setTaskExpanded = (taskId: string, isExpanded: boolean) => {
    setExpandedTasks((prevState) => ({
      ...prevState,
      [taskId]: isExpanded,
    }));
  };

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

  const handleEscKeyPress = () => {
    if (focusedTaskId && expandedTasks[focusedTaskId]) setTaskExpanded(focusedTaskId, false);
  };

  const handleEnterKeyPress = () => {
    if (focusedTaskId) setTaskExpanded(focusedTaskId, true);
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
      className: 'max-w-full lg:max-w-4xl',
      title: t('common:project_settings'),
      text: t('common:project_settings.text'),
      id: 'edit-project',
    });
  };
  const handleTaskSelect = (selected: boolean, taskId: string) => {
    if (selected) return setSelectedTasks([...selectedTasks, taskId]);
    return setSelectedTasks(selectedTasks.filter((id) => id !== taskId));
  };

  const handleTaskFormClick = () => {
    if (!createForm) {
      const container = document.getElementById(`${project.id}-viewport`);
      container?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    toggleCreateForm(project.id);
  };

  useHotkeys([
    ['Escape', handleEscKeyPress],
    ['Enter', handleEnterKeyPress],
  ]);

  useEffect(() => {
    if (!tasks.length) return;

    if (inView && !isFetching) {
      if (typeof totalCount === 'number' && tasks.length >= totalCount) {
        return;
      }
      fetchMore();
    }
  }, [inView, isFetching]);

  useEffect(() => {
    const handleChange = (event: Event) => {
      const { taskId, direction, projectId } = (event as TaskChangeEvent).detail;
      if (projectId !== project.id) return;
      const currentFocusedIndex = showingTasks.findIndex((t) => t.id === taskId);
      const newFocusedTask = showingTasks[currentFocusedIndex + direction];
      setFocusedTaskId(newFocusedTask.id);
    };

    document.addEventListener('task-change', handleChange);

    return () => {
      document.removeEventListener('task-change', handleChange);
    };
  });

  useEffect(() => {
    const handleChange = (event: Event) => {
      const { projectId } = (event as ProjectChangeEvent).detail;
      if (projectId !== project.id) return;
      setFocusedTaskId(showingTasks[0].id);
    };
    document.addEventListener('project-change', handleChange);
    return () => {
      document.removeEventListener('project-change', handleChange);
    };
  });

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
              const edge: Edge | null = extractClosestEdge(targetData);
              const newOrder = getReorderDestinationOrder(targetData.order, edge, 'vertical', sourceData.order);
              // Update order of dragged task
              Electric?.db.tasks.update({
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
              const edge: Edge | null = extractClosestEdge(targetData);
              const newOrder = getReorderDestinationOrder(targetData.order, edge, 'vertical', sourceData.order);
              // Update order of dragged task
              Electric?.db.tasks.update({
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
  // 4rem refers to the header height
  const stickyBackground = <div className="sm:hidden left-0 right-0 h-4 bg-background sticky top-0 z-30 -mt-4" />;

  return (
    <div ref={columnRef} className="flex flex-col h-full">
      <BoardColumnHeader
        id={project.id}
        name={project.name}
        color={project.color}
        createFormClick={handleTaskFormClick}
        openSettings={openSettingsSheet}
        createFormOpen={createForm}
      />
      <div
        className={cn(
          'flex-1 sm:h-[calc(100vh-146px)] relative rounded-b-none max-w-full bg-transparent group/column flex flex-col flex-shrink-0 snap-center border-b opacity-100',
          selectedTasks.length && 'is-selected',
        )}
      >
        {stickyBackground}

        <div className="h-full border-l border-r">
          {createForm && (
            <CreateTaskForm
              projectId={project.id}
              organizationId={project.organizationId}
              tasks={tasks}
              labels={labels}
              members={members}
              onCloseForm={() => toggleCreateForm(project.id)}
            />
          )}

          <div ref={containerRef} />

          {isLoading ? (
            <ColumnSkeleton />
          ) : (
            <>
              <div className="h-full" ref={cardListRef}>
                {!!tasks.length && (
                  <ScrollArea ref={scrollableRef} id={project.id} size="indicatorVertical" className="h-full mx-[-.07rem]">
                    <ScrollBar size="indicatorVertical" />
                    <div className="px-0 relative">
                      <Button
                        onClick={handleAcceptedClick}
                        variant="ghost"
                        disabled={!acceptedCount}
                        size="sm"
                        className="flex justify-start w-full rounded-none gap-1 border-b border-b-green-500/10 ring-inset bg-green-500/5 hover:bg-green-500/10 text-green-500 text-sm -mt-[.07rem]"
                      >
                        <span className="text-xs">
                          {acceptedCount} {t('common:accepted').toLowerCase()}
                        </span>
                        {!!acceptedCount && (
                          <ChevronDown size={16} className={`transition-transform opacity-50 ${showAccepted ? 'rotate-180' : 'rotate-0'}`} />
                        )}
                      </Button>
                      {showingTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          labels={labels}
                          members={members}
                          isExpanded={expandedTasks[task.id] || false}
                          isSelected={selectedTasks.includes(task.id)}
                          isFocused={task.id === focusedTaskId}
                          handleTaskChange={handleChange}
                          handleTaskSelect={handleTaskSelect}
                          setIsExpanded={(isExpanded) => setTaskExpanded(task.id, isExpanded)}
                        />
                      ))}
                      {/* Infinite loading measure ref */}
                      {/* <div
                          key={totalCount}
                          ref={measureRef}
                          className="h-4 w-0 bg-red-700 absolute bottom-0 z-[200]"
                          style={{
                            height: `${showingTasks.length * 0.2 * TASK_CARD_HEIGHT}px`,
                            maxHeight: `${TASK_CARD_HEIGHT * LIMIT}px`,
                          }}
                        /> */}
                    </div>
                    <Button
                      ref={measureRef}
                      onClick={handleIcedClick}
                      variant="ghost"
                      disabled={!icedCount}
                      size="sm"
                      className="flex justify-start w-full rounded-none gap-1 ring-inset text-sky-500 bg-sky-500/5 hover:bg-sky-500/10 text-sm -mt-[.07rem]"
                    >
                      <span className="text-xs">
                        {icedCount} {t('common:iced').toLowerCase()}
                      </span>
                      {!!icedCount && <ChevronDown size={16} className={`transition-transform opacity-50 ${showIced ? 'rotate-180' : 'rotate-0'}`} />}
                    </Button>
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
      </div>
    </div>
  );
}
