import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { withSuspense } from '~/modules/common/with-suspense';
import { DocsLayout } from '~/modules/docs/docs-layout';
import { docsLayoutLoader } from '~/modules/docs/route-logic';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/docs')({
  staticData: { errorHome: '/docs' },
  loader: docsLayoutLoader,
  head: () => pageHead(i18n.t('c:docs')),
  component: withSuspense(DocsLayout),
});
