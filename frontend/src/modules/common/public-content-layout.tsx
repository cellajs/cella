import { Outlet } from '@tanstack/react-router';

/**
 * Sublayout for public content routes (docs pages, public entity views).
 * Auth, sign-out, error and marketing routes live directly under PublicLayout and skip this.
 */
export function PublicContentLayout() {
  return <Outlet />;
}
