import { createFileRoute } from '@tanstack/react-router';
import { AuthLayout } from '~/modules/auth/auth-layout';

/**
 * Layout wrapper for all authentication-related routes.
 */
export const Route = createFileRoute('/_public/auth')({
  staticData: { isAuth: false },
  component: AuthLayout,
});
