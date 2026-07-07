import { createFileRoute } from '@tanstack/react-router';
import { DocsPageComponent } from '~/modules/docs/page-route-components';
import { getDocPage } from '~/modules/page/content';
import { createErrorComponent, createNotFoundComponent } from '~/routes/route-utils';
import { appTitle } from '~/utils/app-title';

/**
 * View page route - displays an individual documentation page. The splat param
 * is the page slug, which may contain slashes (e.g. architecture/sync-engine).
 */
export const Route = createFileRoute('/_public/_content/docs/page/$')({
  staticData: { isAuth: false },
  // Title/description resolve synchronously from the docs metadata index (frontmatter)
  head: ({ params }) => {
    const page = getDocPage(params._splat ?? '');
    return {
      meta: [
        { title: appTitle(page?.name ?? 'Docs') },
        ...(page?.description ? [{ name: 'description', content: page.description }] : []),
      ],
    };
  },
  errorComponent: createErrorComponent('public', '/docs'),
  notFoundComponent: createNotFoundComponent('public', '/docs'),
  component: DocsPageComponent,
});
