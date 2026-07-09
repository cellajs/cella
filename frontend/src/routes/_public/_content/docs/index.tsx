import { createFileRoute } from '@tanstack/react-router';
import { DocsIndexComponent } from '~/modules/docs/page-route-components';
import { docsConfig, ensureDocPageComponent } from '~/modules/page/content';
import { createErrorComponent, createNotFoundComponent } from '~/routes/route-utils';
import { appTitle } from '~/utils/app-title';

/**
 * Index route rendering the docs landing page: intro + tiles from the global docs
 * config (content root index.mdx frontmatter).
 */
export const Route = createFileRoute('/_public/_content/docs/')({
  staticData: { isAuth: false },
  head: () => ({
    meta: [
      { title: appTitle(docsConfig.title) },
      ...(docsConfig.description ? [{ name: 'description', content: docsConfig.description }] : []),
    ],
  }),
  // Resolve the code-split intro body before rendering (same rationale as page.$.tsx).
  loader: async () => {
    await ensureDocPageComponent('');
  },
  errorComponent: createErrorComponent('public', '/docs'),
  notFoundComponent: createNotFoundComponent('public', '/docs'),
  component: DocsIndexComponent,
});
