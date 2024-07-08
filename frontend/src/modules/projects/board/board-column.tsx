import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'electric-sql/react';
import { ChevronDown, Palmtree, Search, Undo } from 'lucide-react';
import { type CSSProperties, lazy, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMembers } from '~/api/general';
import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { cn } from '~/lib/utils';
import useTaskFilters from '~/hooks/use-filtered-tasks';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import { useWorkspaceUIStore } from '~/store/workspace-ui';
import type { Project } from '~/types/index.ts';
import ContentPlaceholder from '../../common/content-placeholder';
import { type Label, type Task, useElectric } from '../../common/electric/electrify';
import { sheet } from '../../common/sheeter/state';
import CreateTaskForm, { type TaskImpact, type TaskType } from '../task/create-task-form';
import { TaskCard, isTaskData } from '../task/task-card';
import { BoardColumnHeader } from './board-column-header';
import { ColumnSkeleton } from './column-skeleton';
import { ProjectSettings } from '../project-settings';
import { SheetNav } from '~/modules/common/sheet-nav';
import { WorkspaceRoute } from '~/routes/workspaces';
import { getTaskOrder } from '../task/helpers';
import { toast } from 'sonner';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { SelectImpact } from '../task/task-selectors/select-impact';
import SetLabels from '../task/task-selectors/select-labels';
import { SelectTaskType } from '../task/task-selectors/select-task-type';
import SelectStatus, { type TaskStatus } from '../task/task-selectors/select-status';
import AssignMembers from '../task/task-selectors/select-members';
import { useWorkspaceStore } from '~/store/workspace';
import { useUserStore } from '~/store/user';
import AutoSizer from 'react-virtualized-auto-sizer';
import { VariableSizeList as List, type VariableSizeList } from 'react-window';

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

  const itemHeights = useRef<number[]>([]);
  const columnRef = useRef<HTMLDivElement | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef(null);

  const { menu } = useNavigationStore();
  const user = useUserStore((state) => state.user);
  const { workspace, searchQuery, selectedTasks, focusedTaskId, setSelectedTasks, setFocusedTaskId } = useWorkspaceStore();
  const { workspaces, changeColumn } = useWorkspaceUIStore();

  const currentProjectSettings = workspaces[workspace.id]?.columns.find((el) => el.columnId === project.id);
  const [showIced, setShowIced] = useState(currentProjectSettings?.expandIced || false);
  const [showAccepted, setShowAccepted] = useState(currentProjectSettings?.expandAccepted || false);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

  const { data: members } = useQuery({
    queryKey: ['projects', 'members', project.id],
    queryFn: () => getMembers({ idOrSlug: project.id, entityType: 'project' }).then((data) => data.items),
    initialData: [],
  });
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const Electric = useElectric()!;

  const { results: tasks = [], updatedAt } = useLiveQuery(
    Electric.db.tasks.liveMany({
      where: {
        project_id: project.id,
        OR: [
          {
            markdown: {
              contains: searchQuery,
            },
          },
        ],
      },
    }),
  ) as {
    results: Task[] | undefined;
    updatedAt: Date | undefined;
  };

  const isLoading = !updatedAt;

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
      db.tasks.update({
        data: {
          assigned_to: assignedTo,
          modified_at: new Date(),
          modified_by: user.id,
        },
        where: {
          id: taskId,
        },
      });
      return;
    }

    // TODO: Review this
    if (field === 'labels' && Array.isArray(value)) {
      const labels = value.map((label) => label.id);
      db.tasks.update({
        data: {
          labels,
          modified_at: new Date(),
          modified_by: user.id,
        },
        where: {
          id: taskId,
        },
      });
      return;
    }
    if (field === 'status') {
      const newOrder = getTaskOrder(taskId, value, tasks);
      db.tasks.update({
        data: {
          status: value,
          ...(newOrder && { sort_order: newOrder }),
          modified_at: new Date(),
          modified_by: user.id,
        },
        where: {
          id: taskId,
        },
      });
      return;
    }

    db.tasks.update({
      data: {
        [field]: value,
        modified_at: new Date(),
        modified_by: user.id,
      },
      where: {
        id: taskId,
      },
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

  const createLabel = (newLabel: Label) => {
    if (!Electric) return toast.error(t('common:local_db_inoperable'));
    // TODO: Implement the following
    // Save the new label to the database
    Electric.db.labels.create({ data: newLabel });
  };

  const handleTaskActionClick = (task: Task, field: string, trigger: HTMLElement) => {
    let component = <SelectTaskType currentType={task.type as TaskType} changeTaskType={(newType) => handleChange('type', newType, task.id)} />;

    if (field === 'impact')
      component = <SelectImpact value={task.impact as TaskImpact} changeTaskImpact={(newImpact) => handleChange('impact', newImpact, task.id)} />;
    else if (field === 'labels')
      component = (
        <SetLabels
          labels={labels}
          value={task.virtualLabels}
          organizationId={task.organization_id}
          projectId={task.project_id}
          changeLabels={(newLabels) => handleChange('labels', newLabels, task.id)}
          createLabel={createLabel}
        />
      );
    else if (field === 'assigned_to')
      component = (
        <AssignMembers
          users={members}
          value={task.virtualAssignedTo}
          changeAssignedTo={(newMembers) => handleChange('assigned_to', newMembers, task.id)}
        />
      );
    else if (field === 'status')
      component = (
        <SelectStatus
          taskStatus={task.status as TaskStatus}
          changeTaskStatus={(newStatus) => handleChange('status', newStatus, task.id)}
          inputPlaceholder={t('common:placeholder.set_status')}
        />
      );

    return dropdowner(component, { id: `${field}-${task.id}`, trigger, align: ['status', 'assigned_to'].includes(field) ? 'end' : 'start' });
  };

  const handleTaskFormClick = () => {
    if (!createForm) {
      const container = document.getElementById(`${project.id}-viewport`);
      container?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    toggleCreateForm(project.id);
  };
  const getItemSize = (index: number) => itemHeights.current[index] || 100;

  const handleItemHeightChange = (index: number, size: number) => {
    const updatedHeights = [...itemHeights.current];
    updatedHeights[index] = size;
    itemHeights.current = updatedHeights;

    console.log('Item heights:', itemHeights.current, containerRef.current);

    // Reset the list after the index to reflect the new size
    if (containerRef.current) (containerRef.current as VariableSizeList).resetAfterIndex?.(index);
  };

  const Task = ({
    index,
    style,
    data,
  }: {
    data: Task[];
    index: number;
    style: CSSProperties;
  }) => (
    <TaskCard
      style={style}
      key={data[index].id}
      task={data[index]}
      isExpanded={expandedTasks[data[index].id] || false}
      isSelected={selectedTasks.includes(data[index].id)}
      isFocused={data[index].id === focusedTaskId}
      handleTaskChange={handleChange}
      handleTaskActionClick={handleTaskActionClick}
      handleTaskSelect={handleTaskSelect}
      setIsExpanded={(isExpanded) => setTaskExpanded(data[index].id, isExpanded)}
      setItemHeight={(size) => handleItemHeightChange(index, size)}
    />
  );

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
          return source.data.type === 'task';
        },
        async onDrop({ location, source }) {
          const target = location.current.dropTargets[0];
          const sourceData = source.data;
          if (!target) return;
          const targetData = target.data;
          // Drag a task
          if (isTaskData(sourceData) && isTaskData(targetData)) {
            const edge: Edge | null = extractClosestEdge(targetData);
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
              <div className="h-full flex flex-col" ref={cardListRef}>
                {!!tasks.length && (
                  <>
                    <div className="px-0 relative flex flex-col flex-grow">
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
                      <div className="grow">
                        <AutoSizer>
                          {({ height, width }: { height: number; width: number }) => (
                            <List height={height} itemCount={showingTasks.length} itemSize={getItemSize} itemData={showingTasks} width={width}>
                              {Task}
                            </List>
                          )}
                        </AutoSizer>
                      </div>
                    </div>
                    <Button
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
                  </>
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
