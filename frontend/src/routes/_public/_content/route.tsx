import { createFileRoute } from '@tanstack/react-router';
import { PublicContentLayout } from '~/modules/common/public-content-layout';

/**
 * Sublayout for public routes that render synced public entities (docs pages, public projects,
 * task links). Mounts the public SSE stream so catchup + live updates run only while these routes
 * are active. Auth, sign-out, error and marketing routes stay parented to the public layout
 * directly and never open a stream connection.
 */
export const Route = createFileRoute('/_public/_content')({
  staticData: { isAuth: false, boundary: 'public' },
  component: PublicContentLayout,
});
