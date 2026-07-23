import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { CheckIcon, RotateCcwKeyIcon, UnlinkIcon } from 'lucide-react';
import { Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/toaster';
import { meAuthQueryOptions, useDeleteTotpMutation } from '~/modules/me/query';
import { SetupTotp } from '~/modules/me/totp-setup';
import { Button } from '~/modules/ui/button';
import { Skeleton } from '~/modules/ui/skeleton';
import { useUserStore } from '~/modules/user/user-store';

export function Totp() {
  const { t } = useTranslation();

  const { user } = useUserStore();
  const { data: authData } = useSuspenseQuery(meAuthQueryOptions());
  const hasTotp = authData.hasTotp;
  const { mutate: deleteTotp, isPending } = useDeleteTotpMutation();

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const openSetupTotp = () => {
    useDialoger.getState().create(
      <Suspense fallback={<Skeleton className="mx-auto my-3 h-72.75 w-72.75" />}>
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
    if (!onlineManager.isOnline()) return toaster.warning(t('c:action.offline.text'));
    if (user.mfaRequired) return toaster.info(t('c:unlink_mfa_last', { method: 'TOTP' }));

    deleteTotp();
  };

  return (
    <div className="mb-6 flex gap-2 max-sm:flex-col">
      {hasTotp && (
        <div className="flex items-center gap-2 px-3">
          <RotateCcwKeyIcon className="mr-2 size-4" />
          <CheckIcon strokeWidth={3} className="size-4.5 text-success" />
          <span>{t('c:totp_activated')}</span>
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
          <UnlinkIcon className="mr-2 size-4" />
          <span>{t('c:unlink')}</span>
        </Button>
      ) : (
        <Button key="createTotp" type="button" variant="plain" onClick={openSetupTotp}>
          <RotateCcwKeyIcon className="mr-2 size-4" />
          <span>{t('c:totp_setup')}</span>
        </Button>
      )}
    </div>
  );
}
