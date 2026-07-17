import { createFileRoute } from '@tanstack/react-router';
import { PublicContentLayout } from '~/modules/common/public-content-layout';

/**
 * Sublayout for public routes that render synced entities (docs, public projects, task links). Mounts
 * the public SSE stream so catchup and live updates run only while these routes are active. Auth,
 * sign-out, error and marketing routes stay on the public layout and never open a stream.
 */
export const Route = createFileRoute('/_public/_content')({
  staticData: { isAuth: false, boundary: 'public' },
  component: PublicContentLayout,
});
