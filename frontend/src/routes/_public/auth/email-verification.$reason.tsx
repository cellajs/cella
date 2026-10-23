import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { z } from 'zod';
import { EmailVerificationPage } from '~/modules/auth/email-verification-page';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/email-verification/$reason')({
  validateSearch: z.object({ provider: z.string().optional() }),
  staticData: { isAuth: false },
  head: () => pageHead(i18n.t('c:email_verification')),
  component: EmailVerificationPage,
});
