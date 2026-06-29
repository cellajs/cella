import { createFileRoute } from '@tanstack/react-router';
import { DocsPageEditComponent } from '~/modules/docs/page-route-components';
import { createErrorComponent, createNotFoundComponent } from '~/routes/route-utils';
import appTitle from '~/utils/app-title';

/**
 * Edit page route - displays the page edit form.
 * Not nested under the page view route (trailing underscore) — it is a sibling view.
 */
export const Route = createFileRoute('/_public/_content/docs/page_/$id/edit')({
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Edit Page') }] }),
  errorComponent: createErrorComponent('public', '/docs'),
  notFoundComponent: createNotFoundComponent('public', '/docs'),
  component: DocsPageEditComponent,
});
