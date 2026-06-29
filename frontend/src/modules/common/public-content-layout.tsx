import { Outlet } from '@tanstack/react-router';
import { PublicStream } from '~/query/realtime/public-stream';

/**
 * Sublayout for public routes that render synced public entities (docs pages, public projects, task links).
 * Mounts the public SSE stream so catchup + live updates run while these routes are active.
 * Auth, sign-out, error and marketing routes live directly under PublicLayout and skip this.
 */
export function PublicContentLayout() {
  return (
    <>
      <PublicStream />
      <Outlet />
    </>
  );
}
