import { createFileRoute } from '@tanstack/react-router';
import { AuthLayout } from '~/modules/auth/auth-layout';

export const Route = createFileRoute('/_public/auth')({
  staticData: { isAuth: false },
  component: AuthLayout,
});
