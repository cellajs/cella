import { createFileRoute } from '@tanstack/react-router';
import { redirectToHomeIfOnboarded } from '~/modules/home/route-logic';
import { withSuspense } from '~/routes/-route-utils';
import { appTitle } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const WelcomePage = lazyNamed(() => import('~/modules/home/welcome-page'), 'WelcomePage');

/**
 * Welcome page shown to new users during onboarding.
 */
export const Route = createFileRoute('/_app/welcome')({
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Welcome') }] }),
  onEnter: () => {
    redirectToHomeIfOnboarded();
  },
  component: withSuspense(WelcomePage),
});
