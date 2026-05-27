import { getRouteApi } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

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
  return (
    <Suspense>
      <UpdatePage key={id} pageId={id} />
    </Suspense>
  );
};
