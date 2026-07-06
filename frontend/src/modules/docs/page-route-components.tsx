import { getRouteApi } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

const ViewPage = lazy(() => import('~/modules/page/view-page'));

const docsPageApi = getRouteApi('/_public/_content/docs/page/$');

export const DocsPageComponent = () => {
  const { _splat } = docsPageApi.useParams();
  const slug = _splat ?? '';
  return (
    <Suspense>
      <ViewPage key={slug} slug={slug} />
    </Suspense>
  );
};
