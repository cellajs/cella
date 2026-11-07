import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { zRedeemLinkTokenPath } from 'sdk/zod.gen';
import { ConfirmLinkPage } from '~/modules/auth/confirm-link-page';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/confirm-link/$type')({
  // A hand-edited link type reads as an invitation.
  params: { parse: (params) => ({ type: zRedeemLinkTokenPath.shape.type.catch('invitation').parse(params.type) }) },
  staticData: { isAuth: false },
  head: ({ params }) => pageHead(i18n.t(params.type === 'invitation' ? 'c:confirm_invitation_link' : 'c:confirm_verification_link')),
  component: ConfirmLinkPage,
});
