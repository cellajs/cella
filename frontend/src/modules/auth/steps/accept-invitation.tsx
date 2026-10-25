import { useNavigate } from '@tanstack/react-router';
import { CheckIcon, TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { AuthHeader } from '~/modules/auth/auth-header';
import type { TokenData } from '~/modules/auth/types';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { useAcceptInvitationTokenMutation } from '~/modules/me/query';
import type { MeUser } from '~/modules/me/types';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';

interface AcceptInvitationStepProps {
  tokenData: TokenData;
  user: MeUser;
}

/**
 * Confirm step for a signed-in visitor holding an invitation token. Accepting joins as the signed-in account, also when
 * the invitation was sent to another address, so nothing happens without an explicit click and both identities are named.
 */
export function AcceptInvitationStep({ tokenData, user }: AcceptInvitationStepProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { invitation, email: invitedEmail } = tokenData;
  const otherAddress = invitedEmail !== user.email;
  // Linked to another account: the backend refuses it, so the step says so and offers no accept button.
  const boundToOther = !!tokenData.userId && tokenData.userId !== user.id;

  const leave = () => navigate({ to: appConfig.defaultRedirectPath, replace: true });

  const { mutate: accept, isPending } = useAcceptInvitationTokenMutation();

  if (boundToOther) {
    return (
      <>
        <AuthHeader title={t('error:user_mismatch')}>
          <p className="font-light">{t('error:user_mismatch.text')}</p>
        </AuthHeader>
        <Button className="w-full" onClick={leave}>
          {t('c:continue')}
        </Button>
      </>
    );
  }

  return (
    <>
      <AuthHeader
        image={invitation && <EntityAvatar type={invitation.entityType} name={invitation.entityName} className="size-14" />}
        title={t('c:invite_accept_as_account')}
      >
        {invitation && (
          <p className="font-light">
            {t('c:invite_accept_as_account.text', {
              inviterName: invitation.inviterName,
              entityName: invitation.entityName,
              role: t(`c:${invitation.role}`).toLowerCase(),
            })}
          </p>
        )}
      </AuthHeader>

      {otherAddress && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>{t('c:invite_other_address')}</AlertTitle>
          <AlertDescription>{t('c:invite_other_address.text', { invitedEmail, accountEmail: user.email })}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <SubmitButton loading={isPending} icon={<CheckIcon />} className="w-full" onClick={() => accept(undefined, { onSuccess: leave })}>
          {t('c:accept')}
        </SubmitButton>
        <Button variant="plain" className="w-full" disabled={isPending} onClick={leave}>
          {t('c:decline')}
        </Button>
      </div>
    </>
  );
}
