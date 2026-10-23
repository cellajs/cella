import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { RotateCcwKeyIcon, TrashIcon } from 'lucide-react';
import { Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ensureStepUp } from '~/modules/auth/step-up';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { ConnectedStatus } from '~/modules/me/connected-status';
import { meAuthQueryOptions, useDeleteTotpMutation } from '~/modules/me/query';
import { SetupTotp } from '~/modules/me/totp-setup';
import { Button } from '~/modules/ui/button';
import { Skeleton } from '~/modules/ui/skeleton';
import { useCurrentUser } from '~/modules/user/user-store';

export function Totp() {
  const { t } = useTranslation();

  const user = useCurrentUser();
  const { data: authData } = useSuspenseQuery(meAuthQueryOptions());
  const hasTotp = authData.hasTotp;
  const { mutate: deleteTotp, isPending } = useDeleteTotpMutation();

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const openSetupTotp = async () => {
    // The key request and the code check need a stepped-up session: the user proves it before the setup opens.
    const steppedUp = await ensureStepUp().then(
      () => true,
      () => false,
    );
    if (!steppedUp) return;

    dialoger.getState().create(
      <Suspense fallback={<Skeleton className="mx-auto my-3 size-72.75" />}>
        <SetupTotp />
      </Suspense>,
      {
        id: 'setup-totp',
        title: t('c:totp_qr.title'),
        description: t('c:totp_qr.description'),
        triggerRef,
        className: 'sm:max-w-md',
        drawerOnMobile: false,
      },
    );
  };

  const handleDeleteTOTP = () => {
    if (!onlineManager.isOnline()) return toastOffline();
    deleteTotp();
  };

  return (
    <div className="mb-6 flex gap-2 max-sm:flex-col">
      {hasTotp && <ConnectedStatus icon={<RotateCcwKeyIcon />}>{t('c:totp_activated')}</ConnectedStatus>}
      {hasTotp ? (
        <Button key="deleteTotp" type="button" variant="plain" loading={isPending} disabled={user.mfaRequired} onClick={handleDeleteTOTP}>
          <TrashIcon className="size-4" />
          <span>{t('c:delete')}</span>
        </Button>
      ) : (
        <Button key="createTotp" type="button" variant="plain" onClick={openSetupTotp}>
          <RotateCcwKeyIcon className="size-4" />
          <span>{t('c:totp_setup')}</span>
        </Button>
      )}
    </div>
  );
}
