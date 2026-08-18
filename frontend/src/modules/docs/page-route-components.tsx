import { getRouteApi } from '@tanstack/react-router';
import { Suspense } from 'react';
import { lazyNamed } from '~/utils/lazy-named';

const ViewPage = lazyNamed(() => import('~/modules/page/view-page'), 'ViewPage');
const DocsLandingPage = lazyNamed(() => import('~/modules/docs/docs-landing-page'), 'DocsLandingPage');

const docsPageApi = getRouteApi('/_public/_content/docs/page/$');

export function DocsIndexComponent() {
  return (
    <Suspense>
      <DocsLandingPage />
    </Suspense>
  );
}

export function DocsPageComponent() {
  const { _splat } = docsPageApi.useParams();
  const slug = _splat ?? '';
  return (
    <Suspense>
      <ViewPage key={slug} slug={slug} />
    </Suspense>
  );
}
