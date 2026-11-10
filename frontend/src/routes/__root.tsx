import { createRootRouteWithContext } from '@tanstack/react-router';
import { Root } from '~/modules/common/root';

/** The sign-in gate is the `_app` layout's; a page under `_public` that needs a session calls `requireSession` in its own `beforeLoad`. */
export const Route = createRootRouteWithContext()({
  staticData: { boundary: 'root' },
  component: Root,
});
