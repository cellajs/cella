import { onlineManager, useMutation } from '@tanstack/react-query';
import { MailIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toaster, toastOffline } from '~/modules/common/toaster/toaster';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button, type ButtonProps } from '~/modules/ui/button';

interface ResendInvitationButtonProps extends ButtonProps {
  /** The sdk call that resends; the token resend answers alike whether or not a mail went out. */
  send: () => Promise<unknown>;
}

/** Resends a pending invitation through `send`; another press is possible 60 s after the request settles. */
export function ResendInvitationButton({ send, ...buttonProps }: ResendInvitationButtonProps) {
  const { t } = useTranslation();
  const [waiting, setWaiting] = useState(false);

  const { mutate, isPending } = useMutation({
    mutationFn: send,
    onSuccess: () => toaster.success(t('c:success.resend_invitation')),
    onSettled: () => setTimeout(() => setWaiting(false), 60000),
  });

  const resend = () => {
    if (!onlineManager.isOnline()) return toastOffline();
    setWaiting(true);
    mutate();
  };

  return (
    <TooltipButton toolTipContent={t('c:resend_invitation.text')}>
      <Button {...buttonProps} onClick={resend} loading={isPending} disabled={waiting}>
        <MailIcon />
        {t('c:resend')}
      </Button>
    </TooltipButton>
  );
}
