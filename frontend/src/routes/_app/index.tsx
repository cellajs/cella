import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { z } from 'zod';
import { HomePage } from '~/modules/home/home-page';
import { redirectToWelcomeIfOnboarding } from '~/modules/home/route-logic';
import { withSuspense } from '~/routes/-route-utils';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_app/')({
  // Renders the home page, which opens the user sheet
  validateSearch: z.object({ userSheetId: z.string().optional() }),
  head: () => pageHead(i18n.t('c:home')),
  staticData: { isAuth: true },
  onEnter: ({ cause }) => {
    if (cause !== 'enter') return;
    redirectToWelcomeIfOnboarding();
  },
  component: withSuspense(HomePage),
});
