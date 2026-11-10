import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { z } from 'zod';
import { EmailVerificationPage } from '~/modules/auth/email-verification-page';
import { emailVerificationRouteSearchParamsSchema } from '~/modules/auth/search-params-schemas';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/email-verification/$reason')({
  // The reasons the OAuth callback sends; a hand-edited one reads as a sign-up.
  params: { parse: (params) => ({ reason: z.enum(['connect', 'signup']).catch('signup').parse(params.reason) }) },
  validateSearch: emailVerificationRouteSearchParamsSchema,
  head: () => pageHead(i18n.t('c:email_verification')),
  component: EmailVerificationPage,
});
