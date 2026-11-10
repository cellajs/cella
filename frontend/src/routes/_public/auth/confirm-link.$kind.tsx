import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { zRedeemLinkTokenPath } from 'sdk/zod.gen';
import { ConfirmLinkPage } from '~/modules/auth/confirm-link-page';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/auth/confirm-link/$kind')({
  // A hand-edited link kind reads as an invitation.
  params: { parse: (params) => ({ kind: zRedeemLinkTokenPath.shape.kind.catch('invitation').parse(params.kind) }) },
  head: ({ params }) => pageHead(i18n.t(params.kind === 'invitation' ? 'c:confirm_invitation_link' : 'c:confirm_verification_link')),
  component: ConfirmLinkPage,
});
