import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { z } from 'zod';
import { ConfirmLinkPage } from '~/modules/auth/confirm-link-page';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/confirm-link/$type')({
  // The link types the backend holds for this page; a hand-edited one reads as an invitation.
  params: { parse: (params) => ({ type: z.enum(['invitation', 'oauth-verification']).catch('invitation').parse(params.type) }) },
  staticData: { isAuth: false },
  head: ({ params }) => pageHead(i18n.t(params.type === 'invitation' ? 'c:confirm_invitation_link' : 'c:confirm_verification_link')),
  component: ConfirmLinkPage,
});
