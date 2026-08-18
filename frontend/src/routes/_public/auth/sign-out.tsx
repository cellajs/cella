import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { SignOut } from '~/modules/auth/sign-out';
import { appTitle } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/sign-out')({
  validateSearch: z.object({ force: z.boolean().optional() }),
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Sign out') }] }),
  component: SignOut,
});
