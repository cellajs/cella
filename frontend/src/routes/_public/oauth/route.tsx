import { createFileRoute } from '@tanstack/react-router';
import { AuthLayout } from '~/modules/auth/auth-layout';

/** The authorization server's user-facing pages (consent) share the sign-in framing. */
export const Route = createFileRoute('/_public/oauth')({
  staticData: { isAuth: false },
  component: AuthLayout,
});
