import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { zUnsubscribeNotificationsQuery } from 'sdk/zod.gen';
import { UnsubscribePage } from '~/modules/notification/unsubscribe-page';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/unsubscribe')({
  validateSearch: zUnsubscribeNotificationsQuery,
  staticData: { isAuth: false },
  head: () => pageHead(i18n.t('c:unsubscribe')),
  component: UnsubscribePage,
});
