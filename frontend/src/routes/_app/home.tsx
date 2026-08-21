import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { HomePage } from '~/modules/home/home-page';
import { redirectToWelcomeIfOnboarding } from '~/modules/home/route-logic';
import { withSuspense } from '~/routes/-route-utils';
import { appTitle } from '~/utils/app-title';

export const Route = createFileRoute('/_app/home')({
  validateSearch: z.object({
    skipWelcome: z.boolean().optional(),
    // The user sheet can be opened from home surfaces
    userSheetId: z.string().optional(),
  }),
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Home') }] }),
  onEnter: ({ search, cause }) => {
    if (cause !== 'enter' || search.skipWelcome) return;
    redirectToWelcomeIfOnboarding();
  },
  component: withSuspense(HomePage),
});
