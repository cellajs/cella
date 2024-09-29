import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronDown, Palmtree, Plus, Search, Undo } from 'lucide-react';
import { type MutableRefObject, lazy, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type GetTasksParams, getTasksList } from '~/api/tasks';
import { useEventListener } from '~/hooks/use-event-listener';

import { cn } from '~/lib/utils';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { type DialogT, dialog } from '~/modules/common/dialoger/state';
import FocusTrap from '~/modules/common/focus-trap';
import { SheetNav } from '~/modules/common/sheet-nav';
import { sheet } from '~/modules/common/sheeter/state';
import { BoardColumnHeader } from '~/modules/projects/board/board-column-header';
import { ColumnSkeleton } from '~/modules/projects/board/column-skeleton';
import { ProjectSettings } from '~/modules/projects/project-settings';
import CreateTaskForm from '~/modules/tasks/create-task-form';
import { sortAndGetCounts } from '~/modules/tasks/helpers';
import { TaskCard } from '~/modules/tasks/task';
import type { CustomEventDetailId, TaskChangeEvent, TaskStates } from '~/modules/tasks/types';
import { Button } from '~/modules/ui/button';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';
import { useThemeStore } from '~/store/theme';
import { useWorkspaceStore } from '~/store/workspace';
import { useWorkspaceUIStore } from '~/store/workspace-ui';
import type { Project } from '~/types/app';

const MembersTable = lazy(() => import('~/modules/organizations/members-table'));

interface BoardColumnProps {
  tasksState: Record<string, TaskStates>;
  project: Project;
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

export function BoardColumn({ project, tasksState }: BoardColumnProps) {
  const { t } = useTranslation();
  const defaultTaskFormRef = useRef<HTMLDivElement | null>(null);
  const afterRef = useRef<HTMLDivElement | null>(null);
  const beforeRef = useRef<HTMLDivElement | null>(null);

  const columnRef = useRef<HTMLDivElement | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);
  const { mode } = useThemeStore();
  const { workspace, searchQuery, selectedTasks, projects, focusedTaskId, setFocusedTaskId, labels } = useWorkspaceStore();
  const { workspaces, changeColumn } = useWorkspaceUIStore();

  const projectLabels = labels.filter((l) => l.projectId === project.id);
  const currentProjectSettings = workspaces[workspace.id]?.columns.find((el) => el.columnId === project.id);
  const [showIced, setShowIced] = useState(currentProjectSettings?.expandIced || false);
  const [showAccepted, setShowAccepted] = useState(currentProjectSettings?.expandAccepted || false);
  const [mouseX, setMouseX] = useState(0);
  const [isMouseNearTop, setIsMouseNearTop] = useState(false);
  const [isMouseNearBottom, setIsMouseNearBottom] = useState(false);

  // Query tasks
  const tasksQuery = useSuspenseQuery(tasksQueryOptions({ projectId: project.id, orgIdOrSlug: project.organizationId }));

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

  const openCreateTaskDialog = (ref: MutableRefObject<HTMLDivElement | null>) => {
    dialog(<CreateTaskForm projectId={project.id} organizationId={project.organizationId} tasks={showingTasks} labels={projectLabels} dialog />, {
      id: `create-task-form-${project.id}`,
      drawerOnMobile: false,
      className: 'w-auto shadow-none relative z-[250] p-0 rounded-none mt-1 max-w-4xl',
      container: ref.current,
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

  const handleTaskFormClick = (e: { detail: string | null }) => {
    const { detail: idOrSlug } = e;
    if (idOrSlug && project.id !== idOrSlug && project.slug !== idOrSlug) return;
    if (!idOrSlug && projects[0].id !== project.id) return;
    openCreateTaskDialog(defaultTaskFormRef);
  };

  useEventListener('toggleCreateTaskForm', handleTaskFormClick);
  useEventListener('focusedTaskChange', handleTaskChangeEventListener);
  useEventListener('focusedProjectChange', handleProjectChangeEventListener);

  // Hides underscroll elements
  // 4rem refers to the header height
  const stickyBackground = <div className="sm:hidden left-0 right-0 h-4 bg-background sticky top-0 z-30 -mt-4" />;

  return (
    <div ref={columnRef} className="flex flex-col h-full">
      <BoardColumnHeader
        id={project.id}
        role={project.membership?.role || 'member'}
        thumbnailUrl={project.thumbnailUrl}
        name={project.name}
        openConfig={openConfigSheet}
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
                      <span className="w-6 mr-1 text-center">{acceptedCount}</span>
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
                                  variant="plain"
                                  size="xs"
                                  style={{ left: `${mouseX}px` }}
                                  className={`absolute bg-background hover:bg-background transform -translate-y-1/2 opacity-1 rounded hidden sm:inline-flex ${index === firstUpstartedIndex ? 'top' : 'bottom'}-2`}
                                  onClick={() => openCreateTaskDialog(index === firstUpstartedIndex ? beforeRef : afterRef)}
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
