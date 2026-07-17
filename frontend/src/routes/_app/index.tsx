import { createFileRoute } from '@tanstack/react-router';
import { HomePage } from '~/modules/home/home-page';
import { redirectToWelcomeIfOnboarding } from '~/modules/home/route-logic';
import { withSuspense } from '~/routes/-route-utils';
import { appTitle } from '~/utils/app-title';

/**
 * Main home page for authenticated users.
 */
export const Route = createFileRoute('/_app/')({
  head: () => ({ meta: [{ title: appTitle('Home') }] }),
  staticData: { isAuth: true },
  onEnter: ({ cause }) => {
    if (cause !== 'enter') return;
    redirectToWelcomeIfOnboarding();
  },
  component: withSuspense(HomePage),
});
