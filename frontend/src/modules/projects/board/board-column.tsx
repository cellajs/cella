import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { ChevronDown, Palmtree, Search, Undo } from 'lucide-react';
import { lazy, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import useTaskFilters from '~/hooks/use-filtered-tasks';
import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { cn } from '~/lib/utils';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { type Task, useElectric } from '~/modules/common/electric/electrify';
import { SheetNav } from '~/modules/common/sheet-nav';
import { sheet } from '~/modules/common/sheeter/state';
import { Button } from '~/modules/ui/button';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';
import { WorkspaceRoute } from '~/routes/workspaces';
import { useNavigationStore } from '~/store/navigation';
import { useThemeStore } from '~/store/theme';
import { useUserStore } from '~/store/user';
import { useWorkspaceStore } from '~/store/workspace';
import { useWorkspaceUIStore } from '~/store/workspace-ui';
import type { Project } from '~/types/index.ts';
import { ProjectSettings } from '../project-settings';
import CreateTaskForm, { type TaskImpact, type TaskType } from '../task/create-task-form';
import { getTaskOrder } from '../task/helpers';
import { isSubTaskData } from '../task/sub-task-card';
import { TaskCard, isTaskData } from '../task/task-card';
import { SelectImpact } from '../task/task-selectors/select-impact';
import SetLabels from '../task/task-selectors/select-labels';
import AssignMembers from '../task/task-selectors/select-members';
import SelectStatus, { type TaskStatus } from '../task/task-selectors/select-status';
import { SelectTaskType } from '../task/task-selectors/select-task-type';
import { BoardColumnHeader } from './board-column-header';
import { ColumnSkeleton } from './column-skeleton';

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
  project: Project;
  createForm: boolean;
  toggleCreateForm: (projectId: string) => void;
}

export function BoardColumn({ project, createForm, toggleCreateForm }: BoardColumnProps) {
  const { t } = useTranslation();

  const columnRef = useRef<HTMLDivElement | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);
  const scrollableRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef(null);

  const { user } = useUserStore();
  const { menu } = useNavigationStore();
  const { mode } = useThemeStore();
  const { workspace, searchQuery, selectedTasks, focusedTaskId, setSelectedTasks, setFocusedTaskId, members, labels } = useWorkspaceStore();
  const { workspaces, changeColumn } = useWorkspaceUIStore();

  const projectLabels = labels.filter((l) => l.project_id === project.id);
  const currentProjectSettings = workspaces[workspace.id]?.columns.find((el) => el.columnId === project.id);
  const [showIced, setShowIced] = useState(currentProjectSettings?.expandIced || false);
  const [showAccepted, setShowAccepted] = useState(currentProjectSettings?.expandAccepted || false);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

  const [fetchedTasks, setFetchedTasks] = useState<Task[]>();
  const [tasks, setTasks] = useState<Task[]>([]);

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const Electric = useElectric()!;

  const isLoading = !fetchedTasks;

  const handleTaskActionClick = (task: Task, field: string, trigger: HTMLElement) => {
    let component = <SelectTaskType currentType={task.type as TaskType} changeTaskType={(newType) => handleChange('type', newType, task.id)} />;

    if (field === 'impact')
      component = <SelectImpact value={task.impact as TaskImpact} changeTaskImpact={(newImpact) => handleChange('impact', newImpact, task.id)} />;
    else if (field === 'labels')
      component = <SetLabels value={task.virtualLabels} organizationId={task.organization_id} projectId={task.project_id} />;
    else if (field === 'assigned_to') component = <AssignMembers projectId={task.project_id} value={task.virtualAssignedTo} />;
    else if (field === 'status')
      component = (
        <SelectStatus taskStatus={task.status as TaskStatus} changeTaskStatus={(newStatus) => handleChange('status', newStatus, task.id)} />
      );

    return dropdowner(component, { id: field, trigger, align: ['status', 'assigned_to'].includes(field) ? 'end' : 'start' });
  };

  const { showingTasks, acceptedCount, icedCount } = useTaskFilters(
    tasks,
    showAccepted,
    showIced,
    projectLabels,
    members.filter((m) => m.projectIds.includes(project.id)),
  );

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
  const handleChange = (field: keyof Task, value: string | number | null, taskId: string) => {
    if (!Electric) return toast.error('common:local_db_inoperable');

    const db = Electric.db;
    const newOrder = field === 'status' ? getTaskOrder(taskId, value, tasks) : null;

    db.tasks.update({
      data: {
        [field]: value,
        ...(newOrder && { sort_order: newOrder }),
        modified_at: new Date(),
        modified_by: user.id,
      },
      where: {
        id: taskId,
      },
    });
  };

  const handleTaskFormClick = () => {
    toggleCreateForm(project.id);
  };

  // Open on key press
  const hotKeyPress = (event: KeyboardEvent, field: string) => {
    const focusedTask = showingTasks.find((t) => t.id === focusedTaskId);
    if (!focusedTask || !event.target) return;
    const trigger = (event.target as HTMLElement).querySelector(`#${field}`);
    if (!trigger) return dropdowner.remove();
    handleTaskActionClick(focusedTask, field, trigger as HTMLElement);
  };

  useHotkeys([
    ['a', (e) => hotKeyPress(e, 'assigned_to')],
    ['i', (e) => hotKeyPress(e, 'impact')],
    ['l', (e) => hotKeyPress(e, 'labels')],
    ['s', (e) => hotKeyPress(e, 'status')],
    ['t', (e) => hotKeyPress(e, 'type')],
  ]);

  useHotkeys([
    ['Escape', handleEscKeyPress],
    ['Enter', handleEnterKeyPress],
  ]);

  useEffect(() => {
    const handleChange = (event: Event) => {
      const { taskId, direction, projectId } = (event as TaskChangeEvent).detail;
      if (projectId !== project.id) return;
      const currentFocusedIndex = showingTasks.findIndex((t) => t.id === taskId);
      const newFocusedTask = showingTasks[currentFocusedIndex + direction];
      setFocusedTaskId(newFocusedTask.id);
    };

    document.addEventListener('task-change', handleChange);
    return () => document.removeEventListener('task-change', handleChange);
  });

  useEffect(() => {
    if (searchQuery.length && fetchedTasks) return setTasks(fetchedTasks.filter((t) => t.summary?.includes(searchQuery)));
    if (fetchedTasks) return setTasks(fetchedTasks);
  }, [searchQuery, fetchedTasks]);

  useEffect(() => {
    let isMounted = true; // Track whether the component is mounted
    (async () => {
      if (isMounted) {
        const result = await Electric.db.tasks.findMany({
          where: {
            project_id: project.id,
          },
        });
        setFetchedTasks(result as Task[]);
      }
    })();

    return () => {
      isMounted = false; // Cleanup to avoid setting state if unmounted
    };
  }, []);

  useEffect(() => {
    const handleChange = (event: Event) => {
      const { projectId } = (event as ProjectChangeEvent).detail;
      if (projectId !== project.id) return;
      setFocusedTaskId(showingTasks[0].id);
    };
    document.addEventListener('project-change', handleChange);
    return () => document.removeEventListener('project-change', handleChange);
  });

  useEffect(() => {
    return combine(
      monitorForElements({
        canMonitor({ source }) {
          return source.data.type === 'task' || source.data.type === 'subTask';
        },
        async onDrop({ location, source }) {
          const target = location.current.dropTargets[0];
          const sourceData = source.data;
          if (!target) return;
          const targetData = target.data;
          const edge: Edge | null = extractClosestEdge(targetData);
          // Drag a task
          if (isTaskData(sourceData) && isTaskData(targetData)) {
            const relativeTask = await Electric?.db.tasks.findFirst({
              where: {
                sort_order: { [edge === 'top' ? 'gt' : 'lt']: targetData.order },
                project_id: targetData.item.project_id,
              },
              orderBy: {
                sort_order: edge === 'top' ? 'asc' : 'desc',
              },
            });
            let newOrder: number;
            if (!relativeTask || relativeTask.sort_order === targetData.order) {
              newOrder = edge === 'top' ? targetData.order + 1 : targetData.order / 2;
            } else if (relativeTask.id === sourceData.item.id) {
              newOrder = sourceData.item.sort_order;
            } else {
              newOrder = (relativeTask.sort_order + targetData.order) / 2;
            }
            // Update order of dragged task
            Electric?.db.tasks.update({
              data: {
                sort_order: newOrder,
                // Define drag a task in same or different column
                ...(sourceData.item.project_id !== targetData.item.project_id && { project_id: targetData.item.project_id }),
              },
              where: {
                id: sourceData.item.id,
              },
            });
          }
          if (isSubTaskData(sourceData) && isSubTaskData(targetData)) {
            const relativeTask = await Electric?.db.tasks.findFirst({
              where: {
                sort_order: { [edge === 'top' ? 'lt' : 'gt']: targetData.order },
                project_id: targetData.item.project_id,
              },
              orderBy: {
                sort_order: edge === 'top' ? 'desc' : 'asc',
              },
            });
            let newOrder: number;
            if (!relativeTask || relativeTask.sort_order === targetData.order) {
              newOrder = edge === 'top' ? targetData.order / 2 : targetData.order + 1;
            } else if (relativeTask.id === sourceData.item.id) {
              newOrder = sourceData.item.sort_order;
            } else {
              newOrder = (relativeTask.sort_order + targetData.order) / 2;
            }
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
        thumbnailUrl={project.thumbnailUrl}
        name={project.name}
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
              labels={projectLabels}
              onCloseForm={() => toggleCreateForm(project.id)}
            />
          )}

          <div ref={containerRef} />

          {isLoading ? (
            <ColumnSkeleton />
          ) : (
            <>
              <div className="h-full" ref={cardListRef}>
                {!!showingTasks.length && (
                  <ScrollArea ref={scrollableRef} id={project.id} size="indicatorVertical" className="h-full mx-[-.07rem]">
                    <ScrollBar size="indicatorVertical" />
                    <div className="px-0 relative">
                      <Button
                        onClick={handleAcceptedClick}
                        variant="ghost"
                        disabled={!acceptedCount}
                        size="sm"
                        className="flex relative justify-start w-full rounded-none gap-1 border-b border-b-green-500/10 ring-inset bg-green-500/5 hover:bg-green-500/10 text-green-500 text-xs -mt-[.07rem]"
                      >
                        <span className="w-6 mr-1 text-center">{acceptedCount}</span>
                        <span>{t('common:accepted').toLowerCase()}</span>
                        {!!acceptedCount && (
                          <ChevronDown
                            size={16}
                            className={`transition-transform absolute right-5 opacity-50 ${showAccepted ? 'rotate-180' : 'rotate-0'}`}
                          />
                        )}
                      </Button>
                      {showingTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          mode={mode}
                          isExpanded={expandedTasks[task.id] || false}
                          isSelected={selectedTasks.includes(task.id)}
                          isFocused={task.id === focusedTaskId}
                          handleTaskChange={handleChange}
                          handleTaskActionClick={handleTaskActionClick}
                          handleTaskSelect={handleTaskSelect}
                          setIsExpanded={(isExpanded) => setTaskExpanded(task.id, isExpanded)}
                        />
                      ))}
                    </div>
                    <Button
                      onClick={handleIcedClick}
                      variant="ghost"
                      disabled={!icedCount}
                      size="sm"
                      className="flex relative justify-start w-full rounded-none gap-1 ring-inset text-sky-500 bg-sky-500/5 hover:bg-sky-500/10 text-xs -mt-[.07rem]"
                    >
                      <span className="w-6 mr-1 text-center">{icedCount}</span>
                      <span> {t('common:iced').toLowerCase()}</span>
                      {!!icedCount && (
                        <ChevronDown
                          size={16}
                          className={`transition-transform absolute right-5 opacity-50 ${showIced ? 'rotate-180' : 'rotate-0'}`}
                        />
                      )}
                    </Button>
                  </ScrollArea>
                )}

                {!showingTasks.length && !searchQuery && (
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
                {!showingTasks.length && searchQuery && (
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
