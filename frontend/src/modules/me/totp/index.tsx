import { onlineManager } from '@tanstack/react-query';
import { Check, QrCode, RotateCw, Trash } from 'lucide-react';
import { Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { unlinkTotp } from '~/api.gen';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import Spinner from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/service';
import { TOTPSetup } from '~/modules/me/totp/setup';
import { Button } from '~/modules/ui/button';

const TOTPs = () => {
  const { t } = useTranslation();
  // const { hasPasskey, setMeAuthData } = useUserStore.getState();
  //TODO add state to store
  const hasTOTP = false;

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const setUpTOTP = () => {
    useDialoger.getState().create(
      <Suspense fallback={<Spinner />}>
        <TOTPSetup />
      </Suspense>,
      {
        id: '2fa-uri',
        triggerRef,
        className: 'sm:max-w-md',
        drawerOnMobile: false,
        hideClose: false,
      },
    );
  };

  const unlinkTOTP = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    unlinkTotp();
  };

  return (
    <>
      {hasTOTP && (
        <div className="flex items-center gap-2 mb-6 px-3">
          <QrCode className="w-4 h-4 mr-2" />
          <Check size={18} strokeWidth={3} className="text-success" />
          <span>{t('common:totp_registered')}</span>
        </div>
      )}
      <div className="flex max-sm:flex-col gap-2 mb-6">
        <Button key="setUpPasskey" type="button" variant="plain" onClick={setUpTOTP}>
          {hasTOTP ? <RotateCw className="w-4 h-4 mr-2" /> : <QrCode className="w-4 h-4 mr-2" />}
          {hasTOTP ? t('common:reset_totp') : t('common:create_resource', { resource: t('common:totp').toLowerCase() })}
        </Button>
        {hasTOTP && (
          <Button key="unlinkPasskey" type="button" variant="ghost" onClick={unlinkTOTP}>
            <Trash className="w-4 h-4 mr-2" />
            <span>{t('common:unlink')}</span>
          </Button>
        )}
      </div>
    </>
  );
};

export default TOTPs;
