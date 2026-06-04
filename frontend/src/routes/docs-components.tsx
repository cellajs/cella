import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { appConfig } from 'shared';
import { YjsTokenFetcher } from '~/modules/common/blocknote/yjs-token-fetcher';
import { myMembershipsQueryOptions } from '~/modules/me/query';

const ViewPage = lazy(() => import('~/modules/page/view-page'));
const UpdatePage = lazy(() => import('~/modules/page/update-page'));

const docsPageApi = getRouteApi('/publicLayout/publicContentLayout/docs/page/$id');
const docsPageEditApi = getRouteApi('/publicLayout/publicContentLayout/docs/page/$id/edit');

export const DocsPageComponent = () => {
  const { id } = docsPageApi.useParams();
  return (
    <Suspense>
      <ViewPage key={id} pageId={id} />
    </Suspense>
  );
};

export const DocsPageEditComponent = () => {
  const { id } = docsPageEditApi.useParams();
  // Pages are tenant-less and have no org of their own, but the yjs token endpoint
  // requires an org the user is a member of (sysAdmin gate). Pick the first one.
  const { data: memberships } = useQuery(myMembershipsQueryOptions());
  const organizationId = memberships?.items[0]?.organizationId;
  return (
    <Suspense>
      {!!appConfig.yjsUrl && !!organizationId && (
        <YjsTokenFetcher entityType="page" tenantId="" organizationId={organizationId} />
      )}
      <UpdatePage key={id} pageId={id} />
    </Suspense>
  );
};
