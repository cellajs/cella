import { createFileRoute } from '@tanstack/react-router';
import { notificationLinkSearchSchema } from 'shared/utils/notification-link';
import { notificationLinkBeforeLoad } from '~/modules/notification/route-logic';
import { SpinnerPage } from '~/routes/-route-utils';

/** Notification deep link (emails, push): forwards to the subject's channel route, see route-logic.ts. */
export const Route = createFileRoute('/_app/n')({
  staticData: { isAuth: true },
  validateSearch: notificationLinkSearchSchema,
  beforeLoad: ({ search }) => notificationLinkBeforeLoad(search),
  component: SpinnerPage,
});
