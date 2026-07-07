import { createFileRoute } from '@tanstack/react-router';
import { Unsubscribed as UnsubscribedPage } from '~/modules/auth/unsubscribed-page';
import { appTitle } from '~/utils/app-title';

/**
 * Confirmation page shown after unsubscribing from emails.
 */
export const Route = createFileRoute('/_public/auth/unsubscribed')({
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Unsubscribed') }] }),
  component: UnsubscribedPage,
});
