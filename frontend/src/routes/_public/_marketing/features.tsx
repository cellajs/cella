import { createFileRoute } from '@tanstack/react-router';
import { FeaturesPage } from '~/modules/marketing/features-page';
import { appTitle } from '~/utils/app-title';

/**
 * Features overview page listing all template capabilities.
 */
export const Route = createFileRoute('/_public/_marketing/features')({
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Features') }] }),
  component: FeaturesPage,
});
