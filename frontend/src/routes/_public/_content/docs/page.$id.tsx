import { createFileRoute } from '@tanstack/react-router';
import { DocsPageComponent } from '~/modules/docs/page-route-components';
import { createErrorComponent, createNotFoundComponent } from '~/routes/route-utils';
import appTitle from '~/utils/app-title';

/**
 * View page route - displays an individual documentation page.
 */
export const Route = createFileRoute('/_public/_content/docs/page/$id')({
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Page') }] }),
  errorComponent: createErrorComponent('public', '/docs'),
  notFoundComponent: createNotFoundComponent('public', '/docs'),
  component: DocsPageComponent,
});
