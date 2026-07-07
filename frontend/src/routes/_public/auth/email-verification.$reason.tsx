import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { EmailVerificationPage } from '~/modules/auth/email-verification-page';
import { appTitle } from '~/utils/app-title';

/**
 * Email verification page to confirm user email addresses.
 */
export const Route = createFileRoute('/_public/auth/email-verification/$reason')({
  validateSearch: z.object({ provider: z.string().optional() }),
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Email verification') }] }),
  component: EmailVerificationPage,
});
