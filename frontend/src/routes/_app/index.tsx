import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { HomePage } from '~/modules/home/home-page';
import { redirectToWelcomeIfOnboarding } from '~/modules/home/route-logic';
import { withSuspense } from '~/routes/-route-utils';
import { appTitle } from '~/utils/app-title';

export const Route = createFileRoute('/_app/')({
  // The user sheet can be opened from home surfaces
  validateSearch: z.object({ userSheetId: z.string().optional() }),
  head: () => ({ meta: [{ title: appTitle('Home') }] }),
  staticData: { isAuth: true },
  onEnter: ({ cause }) => {
    if (cause !== 'enter') return;
    redirectToWelcomeIfOnboarding();
  },
  component: withSuspense(HomePage),
});
