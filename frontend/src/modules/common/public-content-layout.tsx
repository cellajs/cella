import { Outlet } from '@tanstack/react-router';

/** Sublayout for public content routes; auth, sign-out, error and marketing routes skip it. */
export function PublicContentLayout() {
  return <Outlet />;
}
