import { onlineManager, useMutation } from '@tanstack/react-query';
import { MailIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, type ResendInvitationWithTokenData, type ResendInvitationWithTokenResponse, resendInvitationWithToken } from '~/api.gen';
import { CallbackArgs } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/service';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button, type ButtonProps } from '~/modules/ui/button';

type ResendButtonPrpos = {
  resendData: ResendInvitationWithTokenData['body'];
  buttonProps?: ButtonProps;
  wrapperClassName?: string;
  callback?: (args: CallbackArgs) => void;
};

/**
 * Button to resend an invitation token email to a non-existing user. It can either be a membership invitation or a system-level invitation.
 */
export const ResendInvitationButton = ({ resendData, wrapperClassName, buttonProps, callback }: ResendButtonPrpos) => {
  const { t } = useTranslation();
  const [disabledResetPassword, setDisabledResetPassword] = useState(false);

  const { mutate: resend, isPending } = useMutation<ResendInvitationWithTokenResponse, ApiError, ResendInvitationWithTokenData['body']>({
    mutationFn: (body) => resendInvitationWithToken({ body }),
    onSuccess: () => {
      useDialoger.getState().remove();
      toaster(t('common:success.resend_invitation'), 'success');
      callback?.({ status: 'success' });
    },
    onError: (error) => {
      document.getElementById('reset-email-field')?.focus();
      callback?.({ error, status: 'fail' });
    },
    onSettled: () => {
      callback?.({ status: 'settle' });
      setTimeout(() => setDisabledResetPassword(false), 60000);
    },
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
        <MailIcon size={16} className="mr-2" />
        {t('common:resend')}
      </Button>
    </TooltipButton>
  );
};
