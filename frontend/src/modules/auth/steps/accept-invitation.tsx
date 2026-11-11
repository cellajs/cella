import { useNavigate } from '@tanstack/react-router';
import { CheckIcon, InfoIcon, MailIcon, TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { AuthHeader, InvitationAvatar } from '~/modules/auth/auth-header';
import type { TokenData } from '~/modules/auth/types';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { useAcceptInvitationTokenMutation, useConfirmInvitationAddressMutation } from '~/modules/me/query';
import type { MeUser } from '~/modules/me/types';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';

/**
 * Confirm step for a signed-in visitor holding an invitation token. Accepting joins as the signed-in account, which must
 * hold the invited address: an account on another address is offered a link to that address, and opening it there lets
 * it join. Nothing happens without an explicit click, and both addresses are named.
 */
export function AcceptInvitationStep({ tokenData, user }: { tokenData: TokenData; user: MeUser }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { invitation, email: invitedEmail } = tokenData;
  const accountEmail = user.email;
  const otherAddress = invitedEmail !== accountEmail;
  // Linked to another account: the backend refuses it, so the step says so and offers no accept button.
  const boundToOther = !!tokenData.userId && tokenData.userId !== user.id;
  // Linked to this account on another address: the link came through the invited inbox, and the account joins without it.
  const confirmedByLink = otherAddress && tokenData.userId === user.id;

  const leave = () => navigate({ to: appConfig.defaultRedirectPath, replace: true });

  // Accepted: open the channel joined, through the link that resolves its route
  const open = () => {
    if (!invitation) return leave();
    const { tenantId, organizationId, channelId, entityType: channelType } = invitation;
    navigate({ to: '/n', search: { tenantId, organizationId, channelId, channelType }, replace: true });
  };

  const { mutate: accept, isPending, error } = useAcceptInvitationTokenMutation();
  const { mutate: sendLink, isPending: isSending, isSuccess: linkSent } = useConfirmInvitationAddressMutation();
  const unproven = error?.type === 'invitation_address_unproven';

  if (boundToOther) {
    return (
      <>
        <AuthHeader title={t('error:user_mismatch')} description={t('error:user_mismatch.text')} />
        <Button size="block" onClick={leave}>
          {t('c:continue')}
        </Button>
      </>
    );
  }

  if (linkSent) {
    return (
      <>
        <AuthHeader
          title={t('c:invite_confirm_address_sent', { invitedEmail })}
          description={t('c:invite_confirm_address_sent.text', { accountEmail })}
        />
        <Button size="block" onClick={leave}>
          {t('c:continue')}
        </Button>
      </>
    );
  }

  return (
    <>
      <AuthHeader
        image={invitation && <InvitationAvatar invitation={invitation} />}
        title={t('c:invite_accept_as_account')}
        description={
          invitation &&
          t(invitation.organizationName ? 'c:invite_accept_as_account_in_organization.text' : 'c:invite_accept_as_account.text', {
            ...invitation,
            role: t(`c:${invitation.role}`),
          })
        }
      />

      {unproven ? (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>{t('c:invite_confirm_address', { invitedEmail })}</AlertTitle>
          <AlertDescription>{t('c:invite_confirm_address.text', { invitedEmail, accountEmail })}</AlertDescription>
        </Alert>
      ) : confirmedByLink ? (
        <Alert variant="info">
          <InfoIcon />
          <AlertTitle>{t('c:invite_other_address')}</AlertTitle>
          <AlertDescription>{t('c:invite_address_confirmed', { invitedEmail, accountEmail })}</AlertDescription>
        </Alert>
      ) : (
        otherAddress && (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertTitle>{t('c:invite_other_address')}</AlertTitle>
            <AlertDescription>{t('c:invite_other_address.text', { invitedEmail, accountEmail })}</AlertDescription>
          </Alert>
        )
      )}

      <div className="flex flex-col gap-2">
        {unproven ? (
          <SubmitButton loading={isSending} icon={<MailIcon />} size="block" onClick={() => sendLink()}>
            {t('c:invite_send_link')}
          </SubmitButton>
        ) : (
          <SubmitButton loading={isPending} icon={<CheckIcon />} size="block" onClick={() => accept(undefined, { onSuccess: open })}>
            {t('c:accept')}
          </SubmitButton>
        )}
        <Button variant="glass" size="block" disabled={isPending || isSending} onClick={leave}>
          {t('c:decline')}
        </Button>
      </div>
    </>
  );
}
