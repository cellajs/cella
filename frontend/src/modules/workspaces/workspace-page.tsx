import { type ChangeMessage, ShapeStream, type ShapeStreamOptions } from '@electric-sql/client';
import { Outlet, useLocation } from '@tanstack/react-router';
import { config } from 'config';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getOrganization } from '~/api/organizations';
import { useEventListener } from '~/hooks/use-event-listener';
import { queryClient } from '~/lib/router';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageHeader } from '~/modules/common/page-header';
import { useUpdateWorkspaceMutation } from '~/modules/workspaces/update-workspace-form';
import { useGeneralStore } from '~/store/general';
import { useWorkspaceStore } from '~/store/workspace';
import type { Label } from '~/types/app';
import { objectKeys } from '~/utils/object';
import { workspaceQueryOptions } from './helpers/query-options';
import { useWorkspaceQuery } from './helpers/use-workspace';

type RawLabel = {
  id: string;
  name: string;
  color: string;
  entity: 'label';
  created_at: string;
  last_used: string;
  created_by: string;
  modified_at: string;
  modified_by: string;
  use_count: number;
  organization_id: string;
  project_id: string;
};

const labelShape = (projectIds?: string[]): ShapeStreamOptions => ({
  url: new URL('/v1/shape/labels', config.electricUrl).href,
  where: projectIds ? projectIds.map((id) => `project_id = '${id}'`).join(' OR ') : undefined,
  backoffOptions: {
    initialDelay: 500,
    maxDelay: 32000,
    multiplier: 2,
  },
});

const WorkspacePage = () => {
  const { t } = useTranslation();
  const { networkMode } = useGeneralStore();
  const { showPageHeader, setSelectedTasks, setSearchQuery } = useWorkspaceStore();

  const {
    data: { workspace, projects },
  } = useWorkspaceQuery();

  const { pathname } = useLocation();

  const isAdmin = workspace.membership?.role === 'admin';

  //TODO  try find other solution other than useMutateWorkspaceQueryData hook
  const { mutate } = useUpdateWorkspaceMutation(workspace.id, workspace.organizationId);

  useEventListener('updateEntityCover', (e) => {
    const { bannerUrl, entity } = e.detail;
    if (entity !== workspace.entity) return;
    mutate(
      { bannerUrl },
      {
        onSuccess: () => toast.success(t('common:success.upload_cover')),
        onError: () => toast.error(t('common:error.image_upload_failed')),
      },
    );
  });

  useEffect(() => {
    setSearchQuery('');
    setSelectedTasks([]);
  }, [pathname]);

  // Subscribe to task updates
  useEffect(() => {
    if (networkMode !== 'online' || !config.has.sync) return;

    const shapeStream = new ShapeStream<RawLabel>(labelShape(projects.map((p) => p.id)));
    const queryOptions = workspaceQueryOptions(workspace.slug, workspace.organizationId);
    const unsubscribe = shapeStream.subscribe((messages) => {
      const createMessage = messages.find((m) => m.headers.operation === 'insert') as ChangeMessage<RawLabel> | undefined;
      if (createMessage) {
        const value = createMessage.value;
        queryClient.setQueryData(queryOptions.queryKey, (data) => {
          if (!data) return;
          const createdLabel = {} as unknown as Label;
          // TODO: Refactor
          for (const key of objectKeys(value)) {
            if (key === 'project_id') {
              createdLabel.projectId = value[key];
            } else if (key === 'organization_id') {
              createdLabel.organizationId = value[key];
            } else if (key === 'use_count') {
              createdLabel.useCount = value[key];
            } else if (key === 'last_used') {
              createdLabel.lastUsedAt = value[key];
            } else if (key === 'id' || key === 'name' || key === 'color') {
              createdLabel[key] = value[key];
            }
          }
          return {
            ...data,
            labels: [createdLabel, ...data.labels],
          };
        });
      }

      const updateMessage = messages.find((m) => m.headers.operation === 'update') as ChangeMessage<RawLabel> | undefined;
      if (updateMessage) {
        const value = updateMessage.value;
        queryClient.setQueryData(queryOptions.queryKey, (data) => {
          if (!data) return;
          return {
            ...data,
            labels: data.labels.map((label) => {
              if (label.id === value.id) {
                const updatedLabel = {} as unknown as Label;
                // TODO: Refactor
                for (const key of objectKeys(value)) {
                  if (key === 'project_id') {
                    updatedLabel.projectId = value[key];
                  } else if (key === 'organization_id') {
                    updatedLabel.organizationId = value[key];
                  } else if (key === 'use_count') {
                    updatedLabel.useCount = value[key];
                  } else if (key === 'last_used') {
                    updatedLabel.lastUsedAt = value[key];
                  } else if (key === 'id' || key === 'name' || key === 'color') {
                    updatedLabel[key] = value[key];
                  }
                }
                return updatedLabel;
              }

              return label;
            }),
          };
        });
      }
    });
    return () => {
      unsubscribe();
    };
  }, [networkMode]);

  return (
    <FocusViewContainer>
      {showPageHeader && (
        <PageHeader
          type="workspace"
          id={workspace.id}
          isAdmin={isAdmin}
          title={workspace.name}
          thumbnailUrl={workspace.thumbnailUrl}
          bannerUrl={workspace.bannerUrl}
          parent={{ id: workspace.organizationId, fetchFunc: getOrganization }}
        />
      )}
      <div className="flex flex-col gap-2 md:gap-3 p-2 md:p-3 group/workspace">
        <Outlet />
      </div>
    </FocusViewContainer>
  );
};

export default WorkspacePage;
