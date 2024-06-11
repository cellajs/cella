import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { Bird, Redo } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getProjects } from '~/api/projects';
import { getWorkspace } from '~/api/workspaces';
import BoardHeader from '~/modules/projects/board/header/board-header';
import { WorkspaceRoute } from '~/routes/workspaces';
import { useNavigationStore } from '~/store/navigation';
import ContentPlaceholder from '../common/content-placeholder';
import { FocusViewContainer } from '../common/focus-view';
import { PageHeader } from '../common/page-header';
import { WorkspaceProvider } from './workspace-context';

export const workspaceQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: ['workspaces', idOrSlug],
    queryFn: () => getWorkspace(idOrSlug),
  });

export const workspaceProjectsQueryOptions = (workspaceId: string, organizationId: string) =>
  queryOptions({
    queryKey: ['projects', workspaceId],
    queryFn: () =>
      getProjects({
        workspaceId,
        organizationId,
      }),
  });

const WorkspacePage = () => {
  const { t } = useTranslation();
  const { setFocusView } = useNavigationStore();

  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPageHeader, setShowPageHeader] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [focusedProjectIndex, setFocusedProjectIndex] = useState<number | null>(null);

  const { idOrSlug } = useParams({ from: WorkspaceRoute.id });
  const workspaceQuery = useSuspenseQuery(workspaceQueryOptions(idOrSlug));
  const workspace = workspaceQuery.data;

  const projectsQuery = useSuspenseQuery(workspaceProjectsQueryOptions(workspace.id, workspace.organizationId));
  const projects = projectsQuery.data.items;

  const togglePageHeader = () => {
    if (!showPageHeader) setFocusView(false);
    setShowPageHeader(!showPageHeader);
  };

  useEffect(() => {
    setSearchQuery('');
  }, [workspace]);

  return (
    <WorkspaceProvider
      workspace={workspace}
      projects={projects}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      selectedTasks={selectedTasks}
      setSelectedTasks={setSelectedTasks}
      focusedTaskId={focusedTaskId}
      setFocusedTaskId={setFocusedTaskId}
      focusedProjectIndex={focusedProjectIndex}
      setFocusedProjectIndex={setFocusedProjectIndex}
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
    </WorkspaceProvider>
  );
};

export default WorkspacePage;
