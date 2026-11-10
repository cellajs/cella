import { createFileRoute } from '@tanstack/react-router';
import { notificationLinkSearchSchema } from 'shared/utils/notification-link';
import { notificationLinkBeforeLoad } from '~/modules/notification/route-logic';

/** Notification deep link (emails, push): forwards to the subject's channel route, see route-logic.ts. */
export const Route = createFileRoute('/_app/n')({
  validateSearch: notificationLinkSearchSchema,
  beforeLoad: ({ search }) => notificationLinkBeforeLoad(search),
  // Nothing of its own to show: the router's pending spinner at once, until the redirect
  pendingMs: 0,
});
