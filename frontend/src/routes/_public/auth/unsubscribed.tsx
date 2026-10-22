import { createFileRoute } from '@tanstack/react-router';
import { UnsubscribedPage } from '~/modules/auth/unsubscribed-page';
import { appTitle } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/unsubscribed')({
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Unsubscribed') }] }),
  component: UnsubscribedPage,
});
