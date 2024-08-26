import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronDown, Palmtree, Search, Undo } from 'lucide-react';
import { lazy, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type GetTasksParams, getTasksList } from '~/api/tasks';
import { useEventListener } from '~/hooks/use-event-listener';
import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { useMutateTasksQueryData } from '~/hooks/use-mutate-query-data';
import { cn } from '~/lib/utils';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { dropdowner } from '~/modules/common/dropdowner/state';
import FocusTrap from '~/modules/common/focus-trap';
import { SheetNav } from '~/modules/common/sheet-nav';
import { sheet } from '~/modules/common/sheeter/state';
import CreateTaskForm, { type TaskImpact, type TaskType } from '~/modules/tasks/create-task-form';
import { sortAndGetCounts } from '~/modules/tasks/helpers';
import { TaskCard } from '~/modules/tasks/task';
import { SelectImpact } from '~/modules/tasks/task-selectors/select-impact';
import SetLabels from '~/modules/tasks/task-selectors/select-labels';
import AssignMembers from '~/modules/tasks/task-selectors/select-members';
import SelectStatus, { type TaskStatus } from '~/modules/tasks/task-selectors/select-status';
import { SelectTaskType } from '~/modules/tasks/task-selectors/select-task-type';
import { Button } from '~/modules/ui/button';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';
import { WorkspaceRoute } from '~/routes/workspaces';
import { useThemeStore } from '~/store/theme';
import { useWorkspaceStore } from '~/store/workspace';
import { useWorkspaceUIStore } from '~/store/workspace-ui';
import type { CustomEventEventById, Project, Task, TaskCRUDEvent, TaskChangeEvent, WorkspaceStoreProject } from '~/types';
import { ProjectSettings } from '../project-settings';
import { BoardColumnHeader } from './board-column-header';
import { ColumnSkeleton } from './column-skeleton';

const MembersTable = lazy(() => import('~/modules/organizations/members-table'));

interface BoardColumnProps {
  expandedTasks: Record<string, boolean>;
  project: WorkspaceStoreProject;
  createForm: boolean;
  toggleCreateForm: (projectId: string) => void;
}

const tasksQueryOptions = ({ projectId }: GetTasksParams) => {
  return queryOptions({
    queryKey: ['boardTasks', projectId],
    queryFn: async () =>
      await getTasksList({
        projectId,
      }),
  });
};

export function BoardColumn({ project, expandedTasks, createForm, toggleCreateForm }: BoardColumnProps) {
  const { t } = useTranslation();

  const columnRef = useRef<HTMLDivElement | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef(null);
  const { mode } = useThemeStore();
  const { workspace, searchQuery, selectedTasks, focusedTaskId, setFocusedTaskId, labels } = useWorkspaceStore();
  const { workspaces, changeColumn } = useWorkspaceUIStore();

  const projectLabels = labels.filter((l) => l.projectId === project.id);
  const currentProjectSettings = workspaces[workspace.id]?.columns.find((el) => el.columnId === project.id);
  const [showIced, setShowIced] = useState(currentProjectSettings?.expandIced || false);
  const [showAccepted, setShowAccepted] = useState(currentProjectSettings?.expandAccepted || false);

  // Query tasks
  const tasksQuery = useSuspenseQuery(tasksQueryOptions({ projectId: project.id }));

  const callback = useMutateTasksQueryData(['boardTasks', project.id]);

  const handleTaskActionClick = (task: Task, field: string, trigger: HTMLElement) => {
    let component = <SelectTaskType currentType={task.type as TaskType} />;
    if (field === 'impact') component = <SelectImpact value={task.impact as TaskImpact} />;
    else if (field === 'labels') component = <SetLabels value={task.labels} organizationId={task.organizationId} projectId={task.projectId} />;
    else if (field === 'assignedTo') component = <AssignMembers projectId={task.projectId} value={task.assignedTo} />;
    else if (field.includes('status')) component = <SelectStatus taskStatus={task.status as TaskStatus} projectId={task.projectId} />;

    return dropdowner(component, { id: field, trigger, align: field.startsWith('status') || field === 'assignedTo' ? 'end' : 'start' });
  };

  const tasks = useMemo(() => {
    const respTasks = tasksQuery.data?.items || [];
    if (!searchQuery.length) return respTasks;
    return respTasks.filter((t) => t.description.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [tasksQuery.data, searchQuery]);

  const {
    sortedTasks: showingTasks,
    acceptedCount,
    icedCount,
  } = useMemo(() => sortAndGetCounts(tasks, showAccepted, showIced), [tasks, showAccepted, showIced]);

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
      { id: 'general', label: 'common:general', element: <ProjectSettings project={project as unknown as Project} sheet /> },
      {
        id: 'members',
        label: 'common:members',
        element: <MembersTable entity={project as unknown as Project} route={WorkspaceRoute.id} isSheet />,
      },
    ];

    sheet.create(<SheetNav tabs={projectTabs} />, {
      className: 'max-w-full lg:max-w-4xl',
      title: t('common:project_settings'),
      text: t('common:project_settings.text'),
      id: 'edit-project',
    });
  };

  const handleTaskFormClick = () => {
    toggleCreateForm(project.id);
  };

  // Open on key press
  const hotKeyPress = (field: string) => {
    const focusedTask = showingTasks.find((t) => t.id === focusedTaskId);
    if (!focusedTask) return;
    const taskCard = document.getElementById(focusedTask.id);
    if (!taskCard) return;
    if (taskCard && document.activeElement !== taskCard) taskCard.focus();
    const trigger = taskCard.querySelector(`#${field}`);
    if (!trigger) return dropdowner.remove();
    handleTaskActionClick(focusedTask, field, trigger as HTMLElement);
  };

  useHotkeys([
    ['a', () => hotKeyPress('assignedTo')],
    ['i', () => hotKeyPress('impact')],
    ['l', () => hotKeyPress('labels')],
    ['s', () => hotKeyPress(`status-${focusedTaskId}`)],
    ['t', () => hotKeyPress('type')],
  ]);

  const handleTaskChangeEventListener = (event: TaskChangeEvent) => {
    const { taskId, direction, projectId } = event.detail;
    if (projectId !== project.id) return;
    const currentFocusedIndex = showingTasks.findIndex((t) => t.id === taskId);
    const { id } = showingTasks[currentFocusedIndex + direction];
    const taskCard = document.getElementById(id);
    if (taskCard && document.activeElement !== taskCard) taskCard.focus();

    setFocusedTaskId(id);
  };

  const handleProjectChangeEventListener = (event: CustomEventEventById) => {
    if (event.detail !== project.id) return;
    const { id } = showingTasks[0];
    const taskCard = document.getElementById(id);
    if (taskCard && document.activeElement !== taskCard) taskCard.focus();
    setFocusedTaskId(id);
  };

  const handleCRUD = (event: TaskCRUDEvent) => {
    const { array, action } = event.detail;
    callback(array, action);
  };

  useEventListener('taskCRUD', handleCRUD);
  useEventListener('taskChange', handleTaskChangeEventListener);
  useEventListener('projectChange', handleProjectChangeEventListener);

  // Hides underscroll elements
  // 4rem refers to the header height
  const stickyBackground = <div className="sm:hidden left-0 right-0 h-4 bg-background sticky top-0 z-30 -mt-4" />;

  const taskVariants = {
    hidden: { opacity: 0, height: 0 },
    visible: { opacity: 1, height: 'auto' },
    exit: { opacity: 0, height: 0 },
  };
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
              tasks={showingTasks}
              labels={projectLabels}
              onCloseForm={() => toggleCreateForm(project.id)}
            />
          )}

          <div ref={containerRef} />

          {tasksQuery.isLoading ? (
            <ColumnSkeleton />
          ) : (
            <div className="h-full flex flex-col" ref={cardListRef}>
              {!!tasks.length && (
                <ScrollArea id={project.id} className="h-full mx-[-.07rem]">
                  <ScrollBar />
                  <div className="flex flex-col flex-grow">
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
                      <motion.div
                        key={task.id}
                        variants={taskVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        transition={{ duration: 0.15 }}
                      >
                        <FocusTrap mainElementId={task.id} active={task.id === focusedTaskId}>
                          <TaskCard
                            task={task}
                            isExpanded={expandedTasks[task.id] || false}
                            isSelected={selectedTasks.includes(task.id)}
                            isFocused={task.id === focusedTaskId}
                            handleTaskActionClick={handleTaskActionClick}
                            mode={mode}
                          />
                        </FocusTrap>
                      </motion.div>
                    ))}
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
          )}
        </div>
      </div>
    </div>
  );
}
