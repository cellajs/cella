import { onlineManager } from '@tanstack/react-query';
import { CheckIcon, RotateCcwKeyIcon, UnlinkIcon } from 'lucide-react';
import { Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import Spinner from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/service';
import { useDeleteTotpMutation } from '~/modules/me/query';
import { SetupTotp } from '~/modules/me/totp/setup';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';

const Totp = () => {
  const { t } = useTranslation();

  const { hasTotp, user } = useUserStore.getState();
  const { mutate: deleteTotp, isPending } = useDeleteTotpMutation();

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const openSetupTotp = () => {
    useDialoger.getState().create(
      <Suspense fallback={<Spinner />}>
        <SetupTotp />
      </Suspense>,
      {
        id: 'setup-totp',
        title: t('common:totp_qr.title'),
        description: t('common:totp_qr.description'),
        triggerRef,
        className: 'sm:max-w-md',
        drawerOnMobile: false,
        showCloseButton: true,
      },
    );
  };

  const handleDeleteTOTP = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');
    if (user.mfaRequired) return toaster(t('common:unlink_mfa_last', { method: 'TOTP' }), 'info');

    deleteTotp();
  };

  return (
    <div className="flex max-sm:flex-col gap-2 mb-6">
      {hasTotp && (
        <div className="flex items-center gap-2 px-3">
          <RotateCcwKeyIcon className="size-4 mr-2" />
          <CheckIcon size={18} strokeWidth={3} className="text-success" />
          <span>{t('common:totp_activated')}</span>
        </div>
      )}
      {hasTotp ? (
        <Button
          key="deleteTotp"
          type="button"
          variant="plain"
          loading={isPending}
          disabled={user.mfaRequired}
          onClick={handleDeleteTOTP}
        >
          <UnlinkIcon className="size-4 mr-2" />
          <span>{t('common:unlink')}</span>
        </Button>
      ) : (
        <Button key="createTotp" type="button" variant="plain" onClick={openSetupTotp}>
          <RotateCcwKeyIcon className="size-4 mr-2" />
          <span>{t('common:totp_setup')}</span>
        </Button>
      )}
    </div>
  );
};

export default Totp;
