import { onlineManager, useMutation } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, type ResendInvitationData, type ResendInvitationResponse, resendInvitation } from '~/api.gen';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/service';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button, type ButtonProps } from '~/modules/ui/button';

type ResendButtonPrpos = {
  resendData: ResendInvitationData['body'];
  buttonProps?: ButtonProps;
  wrapperClassName?: string;
  callback?: () => void;
};

export const ResendMembershipInviteButton = ({ resendData, wrapperClassName, buttonProps, callback }: ResendButtonPrpos) => {
  const { t } = useTranslation();
  const [disabledResetPassword, setDisabledResetPassword] = useState(false);

  const { mutate: resend, isPending } = useMutation<ResendInvitationResponse, ApiError, ResendInvitationData['body']>({
    mutationFn: (body) => resendInvitation({ body }),
    onSuccess: () => {
      useDialoger.getState().remove();
      toaster(t('common:success.resend_invitation'), 'success');
      if (callback) callback();
    },
    onError: () => document.getElementById('reset-email-field')?.focus(),
    onSettled: () => setTimeout(() => setDisabledResetPassword(false), 60000),
  });

  const resendInvitationClick = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    setDisabledResetPassword(true);
    resend(resendData);
  };

  return (
    <TooltipButton
      className={wrapperClassName}
      toolTipContent={disabledResetPassword ? t('common:retry_resend_invitation.text') : t('common:resend_invitation.text')}
    >
      <Button
        {...buttonProps}
        className="max-sm:w-full"
        aria-label="Resend invitation"
        onClick={resendInvitationClick}
        loading={isPending}
        disabled={disabledResetPassword}
      >
        <Mail size={16} className="mr-2" />
        {t('common:resend')}
      </Button>
    </TooltipButton>
  );
};
