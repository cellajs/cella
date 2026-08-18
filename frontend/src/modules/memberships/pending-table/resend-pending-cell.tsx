import { onlineManager, useMutation } from '@tanstack/react-query';
import { MailIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation for a single-button resend flow.
import { resendPendingInvitation } from 'sdk';
import { toaster } from '~/modules/common/toaster/toaster';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';

type Props = {
  tenantId: string;
  organizationId: string;
  /** The pending (inactive) membership id; the backend resolves and refreshes its own token. */
  membershipId: string;
};

export function ResendPendingInvitationCell({ tenantId, organizationId, membershipId }: Props) {
  const { t } = useTranslation();
  const [resent, setResent] = useState(false);

  const { mutate: resend, isPending } = useMutation({
    mutationFn: () => resendPendingInvitation({ path: { tenantId, organizationId, id: membershipId } }),
    onSuccess: () => {
      toaster.success(t('c:success.resend_invitation'));
      setResent(true);
    },
  });

  const onResendClick = () => {
    if (!onlineManager.isOnline()) return toaster.warning(t('c:action.offline.text'));
    resend();
  };

  return (
    <TooltipButton toolTipContent={resent ? t('c:retry_resend_invitation.text') : t('c:resend_invitation.text')}>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Resend invitation"
        onClick={onResendClick}
        loading={isPending}
        disabled={resent}
      >
        <MailIcon className="mr-2" />
        {t('c:resend')}
      </Button>
    </TooltipButton>
  );
}
