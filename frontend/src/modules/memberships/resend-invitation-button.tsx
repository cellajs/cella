import { onlineManager, useMutation } from '@tanstack/react-query';
import { MailIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiError, ResendInvitationWithTokenData, ResendInvitationWithTokenResponse } from 'sdk';
// biome-ignore lint/style/noRestrictedImports: colocated mutation for single-button resend flow with bespoke error handling.
import { resendInvitationWithToken } from 'sdk';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/toaster';
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
  const [disabledResend, setDisabledResend] = useState(false);

  const { mutate: resend, isPending } = useMutation<
    ResendInvitationWithTokenResponse,
    ApiError,
    ResendInvitationWithTokenData['body']
  >({
    mutationFn: (body) => resendInvitationWithToken({ body }),
    onSuccess: () => {
      useDialoger.getState().remove();
      toaster.success(t('c:success.resend_invitation'));
      callback?.({ status: 'success' });
    },
    onError: (error) => {
      document.getElementById('reset-email-field')?.focus();
      callback?.({ error, status: 'fail' });
    },
    onSettled: () => {
      callback?.({ status: 'settle' });
      setTimeout(() => setDisabledResend(false), 60000);
    },
  });

  const resendInvitationClick = () => {
    if (!onlineManager.isOnline()) return toaster.warning(t('c:action.offline.text'));

    setDisabledResend(true);
    resend(resendData);
  };

  return (
    <TooltipButton
      className={wrapperClassName}
      toolTipContent={disabledResend ? t('c:retry_resend_invitation.text') : t('c:resend_invitation.text')}
    >
      <Button
        {...buttonProps}
        className="max-sm:w-full"
        aria-label="Resend invitation"
        onClick={resendInvitationClick}
        loading={isPending}
        disabled={disabledResend}
      >
        <MailIcon className="mr-2" />
        {t('c:resend')}
      </Button>
    </TooltipButton>
  );
};
