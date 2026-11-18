import { redirect } from '@tanstack/react-router';
import { appConfig } from 'shared';
import { userStore } from '~/modules/user/user-store';

// Nav gating only hides links; this guard asks the same question in `beforeLoad`, and the backend enforces. A channel's
// tabs are gated by `guardNavTabs`; the session itself is `requireSession` in `modules/auth/route-logic.ts`.

export function requireSystemAdmin(): void {
  if (userStore.getState().isSystemAdmin) return;
  throw redirect({ to: appConfig.defaultRedirectPath, replace: true });
}
