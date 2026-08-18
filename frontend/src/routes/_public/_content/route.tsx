import { createFileRoute } from '@tanstack/react-router';
import { PublicContentLayout } from '~/modules/common/public-content-layout';

/** Mounts the public SSE stream, so catchup and live updates run only under this sublayout. */
export const Route = createFileRoute('/_public/_content')({
  staticData: { isAuth: false, boundary: 'public' },
  component: PublicContentLayout,
});
