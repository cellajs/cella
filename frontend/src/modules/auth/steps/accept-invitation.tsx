import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CheckIcon, TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type AcceptInvitationTokenResponse, acceptInvitationToken } from 'sdk';
import { appConfig } from 'shared';
import type { ApiError } from '~/lib/api';
import type { TokenData } from '~/modules/auth/types';
import { toaster } from '~/modules/common/toaster/toaster';
import { meKeys } from '~/modules/me/query';
import type { MeUser } from '~/modules/me/types';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { Button, SubmitButton } from '~/modules/ui/button';
import { queryClient } from '~/query/query-client';

interface Props {
  tokenData: TokenData;
  user: MeUser;
}

/**
 * Confirm step for a signed-in visitor holding an invitation token. Accepting joins as the signed-in account, also when
 * the invitation was sent to another address, so nothing happens without an explicit click and both identities are named.
 */
export function AcceptInvitationStep({ tokenData, user }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { invitation, email: invitedEmail } = tokenData;
  const otherAddress = invitedEmail !== user.email;
  // Linked to another account: the backend refuses it, so say so instead of offering a button that fails.
  const boundToOther = !!tokenData.userId && tokenData.userId !== user.id;

  const leave = () => navigate({ to: appConfig.defaultRedirectPath, replace: true });

  const { mutate: accept, isPending } = useMutation<AcceptInvitationTokenResponse, ApiError>({
    mutationFn: () => acceptInvitationToken(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meKeys.memberships });
      queryClient.invalidateQueries({ queryKey: meKeys.invites });
      toaster.success(t('c:invitation_settled', { action: 'accepted' }));
      leave();
    },
    onError: (error) => toaster.error(error.message || t('error:reported_try_later')),
  });

  if (boundToOther) {
    return (
      <>
        <h1 className="text-center text-2xl">{t('error:user_mismatch')}</h1>
        <p className="text-center font-light">{t('error:user_mismatch.text')}</p>
        <Button className="w-full" onClick={leave}>
          {t('c:continue')}
        </Button>
      </>
    );
  }

  return (
    <>
      <h1 className="text-center text-2xl">{t('c:invite_accept_as_account')}</h1>

      {invitation && (
        <p className="text-center font-light">
          {t('c:invite_accept_as_account.text', {
            inviterName: invitation.inviterName,
            entityName: invitation.entityName,
            role: t(`c:${invitation.role}`).toLowerCase(),
          })}
        </p>
      )}

      {otherAddress && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>{t('c:invite_other_address')}</AlertTitle>
          <AlertDescription>
            {t('c:invite_other_address.text', { invitedEmail, accountEmail: user.email })}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <SubmitButton loading={isPending} icon={<CheckIcon />} className="w-full" onClick={() => accept()}>
          {t('c:accept')}
        </SubmitButton>
        <Button variant="plain" className="w-full" disabled={isPending} onClick={leave}>
          {t('c:decline')}
        </Button>
      </div>
    </>
  );
}
