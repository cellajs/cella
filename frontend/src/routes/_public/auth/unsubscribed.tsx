import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { UnsubscribedPage } from '~/modules/auth/unsubscribed-page';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/unsubscribed')({
  staticData: { isAuth: false },
  head: () => pageHead(i18n.t('c:unsubscribe_title')),
  component: UnsubscribedPage,
});
