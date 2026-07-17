import { createFileRoute } from '@tanstack/react-router';
import { DocsPageComponent } from '~/modules/docs/page-route-components';
import { ensureDocPageComponent, getDocPage } from '~/modules/page/content';
import { createErrorComponent, createNotFoundComponent } from '~/routes/_route-utils';
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
  // Resolve the code-split MDX body before rendering so the page view mounts with
  // content in hand — a suspending lazy body would flash the fallback for at least a
  // frame even when the chunk is cached. Unknown slugs resolve to undefined; the page
  // view throws notFound for those.
  loader: async ({ params }) => {
    await ensureDocPageComponent(params._splat ?? '');
  },
  errorComponent: createErrorComponent('public', '/docs'),
  notFoundComponent: createNotFoundComponent('public', '/docs'),
  component: DocsPageComponent,
});
