import { onlineManager } from '@tanstack/react-query';
import { XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toaster, toastOffline } from '~/modules/common/toaster/toaster';
import type { EnrichedChannel } from '~/modules/entities/types';
import { useWithdrawInvitationMutation } from '~/modules/memberships/query-mutations';
import { Button } from '~/modules/ui/button';

interface WithdrawInvitationButtonProps {
  channel: EnrichedChannel;
  invitationId: string;
}

/** Withdraws a pending invitation, such as one sent to a mistyped address; inviting the address again undoes it. */
export function WithdrawInvitationButton({ channel, invitationId }: WithdrawInvitationButtonProps) {
  const { t } = useTranslation();
  const { mutate, isPending } = useWithdrawInvitationMutation();

  const withdraw = () => {
    if (!onlineManager.isOnline()) return toastOffline();
    mutate({ channel, id: invitationId }, { onSuccess: () => toaster.success(t('c:success.withdraw_invitation')) });
  };

  return (
    <Button variant="ghost" size="sm" onClick={withdraw} loading={isPending}>
      <XIcon />
      {t('c:withdraw')}
    </Button>
  );
}
