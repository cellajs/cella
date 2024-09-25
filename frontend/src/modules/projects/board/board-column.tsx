import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronDown, Palmtree, Search, Undo } from 'lucide-react';
import { lazy, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type GetTasksParams, getTasksList } from '~/api/tasks';
import { useEventListener } from '~/hooks/use-event-listener';

import { cn } from '~/lib/utils';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import FocusTrap from '~/modules/common/focus-trap';
import { SheetNav } from '~/modules/common/sheet-nav';
import { sheet } from '~/modules/common/sheeter/state';
import { BoardColumnHeader } from '~/modules/projects/board/board-column-header';
import { ColumnSkeleton } from '~/modules/projects/board/column-skeleton';
import { ProjectSettings } from '~/modules/projects/project-settings';
import CreateTaskForm from '~/modules/tasks/create-task-form';
import { sortAndGetCounts } from '~/modules/tasks/helpers';
import { TaskCard } from '~/modules/tasks/task';
import type { CustomEventDetailId, TaskChangeEvent } from '~/modules/tasks/types';
import { Button } from '~/modules/ui/button';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';
import { useThemeStore } from '~/store/theme';
import { useWorkspaceStore } from '~/store/workspace';
import { useWorkspaceUIStore } from '~/store/workspace-ui';
import type { Project } from '~/types/app';

const MembersTable = lazy(() => import('~/modules/organizations/members-table'));

interface BoardColumnProps {
  expandedTasks: Record<string, boolean>;
  editingTasks: Record<string, boolean>;
  project: Project;
  createForm: boolean;
}

export const tasksQueryOptions = ({ projectId }: GetTasksParams) => {
  return queryOptions({
    queryKey: ['boardTasks', projectId],
    queryFn: async () =>
      await getTasksList({
        projectId,
      }),
  });
};

export function BoardColumn({ project, expandedTasks, editingTasks, createForm }: BoardColumnProps) {
  const { t } = useTranslation();

  const columnRef = useRef<HTMLDivElement | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);
  const { mode } = useThemeStore();
  const { workspace, searchQuery, selectedTasks, focusedTaskId, setFocusedTaskId, labels } = useWorkspaceStore();
  const { workspaces, changeColumn } = useWorkspaceUIStore();

  const projectLabels = labels.filter((l) => l.projectId === project.id);
  const currentProjectSettings = workspaces[workspace.id]?.columns.find((el) => el.columnId === project.id);
  const [showIced, setShowIced] = useState(currentProjectSettings?.expandIced || false);
  const [showAccepted, setShowAccepted] = useState(currentProjectSettings?.expandAccepted || false);

  // Query tasks
  const tasksQuery = useSuspenseQuery(tasksQueryOptions({ projectId: project.id }));

  const tasks = useMemo(() => {
    const respTasks = tasksQuery.data?.items || [];
    if (!searchQuery.length) return respTasks;
    return respTasks.filter((t) => t.keywords.toLowerCase().includes(searchQuery.toLowerCase()));
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

  const openConfigSheet = () => {
    const isAdmin = project.membership?.role === 'admin';
    const projectTabs = [
      ...(isAdmin
        ? [
            {
              id: 'general',
              label: 'common:general',
              element: <ProjectSettings project={project as unknown as Project} sheet />,
            },
          ]
        : []),
      {
        id: 'members',
        label: 'common:members',
        element: <MembersTable entity={project as unknown as Project} isSheet />,
      },
    ];

    sheet.create(<SheetNav tabs={projectTabs} />, {
      className: 'max-w-full lg:max-w-4xl',
      id: isAdmin ? 'edit-project' : 'project-members',
      title: isAdmin ? t('common:resource_settings', { resource: t('app:project') }) : t('app:project_members'),
      text: isAdmin ? t('common:resource_settings.text', { resource: t('app:project').toLowerCase() }) : '',
    });
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

  const taskVariants = {
    hidden: { opacity: 0, height: 0 },
    visible: { opacity: 1, height: 'auto' },
    exit: { opacity: 0, height: 0 },
  };
  return (
    <div ref={columnRef} className="flex flex-col h-full">
      <BoardColumnHeader
        id={project.id}
        role={project.membership?.role || 'member'}
        thumbnailUrl={project.thumbnailUrl}
        name={project.name}
        openConfig={openConfigSheet}
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
          {tasksQuery.isLoading ? (
            <ColumnSkeleton />
          ) : (
            <ScrollArea id={project.id} className="h-full mx-[-.07rem]">
              <ScrollBar />
              {createForm && (
                <CreateTaskForm projectId={project.id} organizationId={project.organizationId} tasks={showingTasks} labels={projectLabels} />
              )}
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
                      <span className="w-6 mr-1 text-center">{acceptedCount}</span>
                      <span>{t('app:accepted').toLowerCase()}</span>
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
                        initial={task.status === 6 || task.status === 0 ? 'hidden' : 'visible'}
                        animate="visible"
                        exit="exit"
                      >
                        <FocusTrap mainElementId={task.id} active={task.id === focusedTaskId}>
                          <TaskCard
                            task={task}
                            isEditing={editingTasks[task.id] ?? false}
                            isExpanded={expandedTasks[task.id] ?? false}
                            isSelected={selectedTasks.includes(task.id)}
                            isFocused={task.id === focusedTaskId}
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
                      !createForm && (
                        <>
                          <Undo
                            size={200}
                            strokeWidth={0.2}
                            className="max-md:hidden absolute scale-x-0 scale-y-75 rotate-180 text-primary top-4 right-4 translate-y-20 opacity-0 duration-500 delay-500 transition-all group-hover/column:opacity-100 group-hover/column:scale-x-100 group-hover/column:translate-y-0 group-hover/column:rotate-[130deg]"
                          />
                          <p className="inline-flex gap-1 opacity-0 duration-500 transition-opacity group-hover/column:opacity-100">
                            <span>{t('common:click')}</span>
                            <span className="text-primary">{`+ ${t('app:task')}`}</span>
                            <span>{t('app:no_tasks.text')}</span>
                          </p>
                        </>
                      )
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
