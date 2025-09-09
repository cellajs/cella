import { onlineManager } from '@tanstack/react-query';
import { Check, QrCode, Trash } from 'lucide-react';
import { Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import Spinner from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/service';
import { useUnlinkTotpMutation } from '~/modules/me/query';
import { TOTPSetup } from '~/modules/me/totp/setup';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';

const TOTPs = () => {
  const { t } = useTranslation();
  const { hasTotp } = useUserStore.getState();
  const { mutate: unlinkTotp } = useUnlinkTotpMutation();

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const setUpTOTP = () => {
    useDialoger.getState().create(
      <Suspense fallback={<Spinner />}>
        <TOTPSetup />
      </Suspense>,
      {
        id: 'mfa-uri',
        triggerRef,
        className: 'sm:max-w-md',
        drawerOnMobile: false,
        hideClose: false,
      },
    );
  };

  const handleUnlinkTOTP = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    unlinkTotp();
  };

  return (
    <div className="flex max-sm:flex-col gap-2 mb-6">
      {hasTotp && (
        <div className="flex items-center gap-2 px-3">
          <QrCode className="w-4 h-4 mr-2" />
          <Check size={18} strokeWidth={3} className="text-success" />
          <span>{t('common:totp_registered')}</span>
        </div>
      )}
      {hasTotp ? (
        <Button key="unlinkPasskey" type="button" variant="ghost" onClick={handleUnlinkTOTP}>
          <Trash className="w-4 h-4 mr-2" />
          <span>{t('common:unlink')}</span>
        </Button>
      ) : (
        <Button key="setUpPasskey" type="button" variant="plain" onClick={setUpTOTP}>
          <QrCode className="w-4 h-4 mr-2" />
          <span>{t('common:totp_setup')}</span>
        </Button>
      )}
    </div>
  );
};

export default TOTPs;
