import { createFileRoute } from '@tanstack/react-router';
import { DocsIndexComponent } from '~/modules/docs/page-route-components';
import { docsConfig, ensureDocPageComponent } from '~/modules/page/content';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/docs/')({
  // Resolve the code-split intro body before rendering (same rationale as page.$.tsx).
  loader: async () => {
    await ensureDocPageComponent('');
  },
  head: () => pageHead(docsConfig.title, docsConfig.description),
  component: DocsIndexComponent,
});
