import { createFileRoute } from '@tanstack/react-router';
import { notificationLinkSearchSchema } from 'shared/utils/notification-link';
import { embeddedLinkBeforeLoad } from '~/modules/common/embed/route-logic';

/** Where a finished LTI launch lands, with the channel as a notification link names it: forwards to its embedded page. */
export const Route = createFileRoute('/embed/n')({
  validateSearch: notificationLinkSearchSchema,
  beforeLoad: ({ search }) => embeddedLinkBeforeLoad(search),
  // Nothing of its own to show: the router's pending spinner at once, until the redirect
  pendingMs: 0,
});
