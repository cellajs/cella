import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { useLiveQuery } from 'electric-sql/react';
import { Bird, Redo } from 'lucide-react';
import { type Dispatch, type SetStateAction, createContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getProjects } from '~/api/projects';
import { getWorkspaceBySlugOrId } from '~/api/workspaces';
import BoardHeader from '~/modules/projects/board/header/board-header';
import { WorkspaceRoute } from '~/routes/workspaces';
import { useNavigationStore } from '~/store/navigation';
import { useWorkspaceStore } from '~/store/workspace';
import type { ProjectList, Workspace } from '~/types';
import ContentPlaceholder from '../common/content-placeholder';
import { type Label, type PreparedTask, type Task, useElectric } from '../common/electric/electrify';
import { FocusViewContainer } from '../common/focus-view';
import { PageHeader } from '../common/page-header';
import { taskStatuses } from '../projects/task/task-selectors/select-status';

interface WorkspaceContextValue {
  workspace: Workspace;
  projects: ProjectList;
  tasks: PreparedTask[];
  tasksLoading: boolean;
  labels: Label[];
  tasksCount: number;
  selectedTasks: string[];
  setSelectedTasks: Dispatch<SetStateAction<string[]>>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
}

export const WorkspaceContext = createContext({} as WorkspaceContextValue);

export const workspaceQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: ['workspaces', idOrSlug],
    queryFn: () => getWorkspaceBySlugOrId(idOrSlug),
  });

export const workspaceProjectsQueryOptions = (workspace: string, organization: string) =>
  queryOptions({
    queryKey: ['projects', workspace],
    queryFn: () =>
      getProjects({
        workspace,
        organization,
      }),
  });

const WorkspacePage = () => {
  const { t } = useTranslation();
  const { setFocusView } = useNavigationStore();

  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPageHeader, setShowPageHeader] = useState(false);

  const { workspaces, getWorkspaceViewOptions } = useWorkspaceStore();
  const { idOrSlug } = useParams({ from: WorkspaceRoute.id });
  const workspaceQuery = useSuspenseQuery(workspaceQueryOptions(idOrSlug));
  const workspace = workspaceQuery.data;

  const [viewOptions, setViewOptions] = useState(getWorkspaceViewOptions(workspace.id));
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const Electric = useElectric()!;

  const projectsQuery = useSuspenseQuery(workspaceProjectsQueryOptions(workspace.id, workspace.organizationId));
  const projects = projectsQuery.data.items;

  const { results: tasks } = useLiveQuery(
    Electric.db.tasks.liveMany({
      // Cause Cannot read properties of undefined (reading 'relationName')
      // include: {
      //   tasks: true,
      //   other_tasks: true,
      // },
      where: {
        project_id: {
          in: projects.map((project) => project.id),
        },
      },
      orderBy: {
        sort_order: 'asc',
      },
    }),
  ) as {
    results: (Task & {
      other_tasks: Task[];
      tasks: Task | null;
    })[];
  };

  // TODO: TS complains about a prisma issue with the type of labels
  const { results: labels = [] as Label[] } = useLiveQuery(
    Electric.db.labels.liveMany({
      where: {
        project_id: {
          in: projects.map((p) => p.id),
        },
      },
    }),
  );

  const togglePageHeader = () => {
    if (!showPageHeader) setFocusView(false);
    setShowPageHeader(!showPageHeader);
  };

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    if (!searchQuery) return tasks;
    return tasks.filter(
      (task) =>
        task.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.markdown?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.slug.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [searchQuery, tasks]);

  const filteredByViewOptionsTasks = useMemo(() => {
    return filteredTasks.filter(
      (task) =>
        viewOptions.type.includes(task.type) &&
        (task.status === 0 || task.status === 6 || viewOptions.status.includes(taskStatuses[task.status].status)),
      // add to task label status and filter by status of label too
    );
  }, [viewOptions, filteredTasks]);

  useEffect(() => {
    setSearchQuery('');
  }, [workspace]);

  useEffect(() => {
    setViewOptions(workspaces[workspace.id].viewOptions);
  }, [workspaces[workspace.id].viewOptions]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        projects,
        tasksLoading: !tasks,
        tasks: filteredByViewOptionsTasks.map((task) => ({
          ...task,
          // TODO: TS complains about a prisma issue with the type of labels
          labels: (labels as unknown as Label[]).filter((label) => Array.isArray(task.labels) && task.labels.includes(label.id)),
        })),
        tasksCount: filteredByViewOptionsTasks.length,
        // TODO: TS complains about a prisma issue with the type of labels
        labels: labels as unknown as Label[],
        selectedTasks,
        setSelectedTasks,
        searchQuery,
        setSearchQuery,
      }}
    >
      {showPageHeader && (
        <PageHeader
          type="WORKSPACE"
          id={workspace.id}
          title={workspace.name}
          thumbnailUrl={workspace.thumbnailUrl}
          bannerUrl={workspace.bannerUrl}
          organizationId={workspace.organizationId}
        />
      )}
      <FocusViewContainer>
        <div className="flex flex-col gap-2 md:gap-4 p-2 md:p-4 group/workspace">
          <BoardHeader showPageHeader={showPageHeader} handleShowPageHeader={togglePageHeader} />
          {!!projects.length && <Outlet />}
          {!projects.length && (
            <ContentPlaceholder
              className=" h-[calc(100vh-64px-64px)] md:h-[calc(100vh-88px)]"
              Icon={Bird}
              title={t('common:no_resource_yet', { resource: t('common:projects').toLowerCase() })}
              text={
                <>
                  <Redo
                    size={200}
                    strokeWidth={0.2}
                    className="max-md:hidden absolute scale-x-0 scale-y-75 -rotate-180 text-primary top-4 left-4 translate-y-20 opacity-0 duration-500 delay-500 transition-all group-hover/workspace:opacity-100 group-hover/workspace:scale-x-100 group-hover/workspace:translate-y-0 group-hover/workspace:rotate-[-130deg]"
                  />
                  <p className="inline-flex gap-1 opacity-0 duration-500 transition-opacity group-hover/workspace:opacity-100">
                    <span>{t('common:click')}</span>
                    <span className="text-primary">{`+ ${t('common:add')}`}</span>
                    <span>{t('common:no_projects.text')}</span>
                  </p>
                </>
              }
            />
          )}
        </div>
      </FocusViewContainer>
    </WorkspaceContext.Provider>
  );
};

export default WorkspacePage;
