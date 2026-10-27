import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { RotateCcwKeyIcon, TrashIcon } from 'lucide-react';
import { Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ensureStepUp } from '~/modules/auth/step-up';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { ExpandableTile, ExpandableTileDetail } from '~/modules/common/expandable-tile';
import { RelativeDate } from '~/modules/common/relative-date';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { meAuthQueryOptions, useDeleteTotpMutation } from '~/modules/me/query';
import { TotpSetup } from '~/modules/me/totp-setup';
import { Button } from '~/modules/ui/button';
import { Skeleton } from '~/modules/ui/skeleton';
import { useCurrentUser } from '~/modules/user/user-store';
import { dateShort } from '~/utils/date-short';

/** TOTP as a tile once it is set up, else the button that sets it up. */
export function Totp() {
  const { t } = useTranslation();

  const user = useCurrentUser();
  const {
    data: { totp },
  } = useSuspenseQuery(meAuthQueryOptions());
  const { mutate: deleteTotp, isPending } = useDeleteTotpMutation();

  const triggerRef = useRef<HTMLButtonElement>(null);

  const openTotpSetup = async () => {
    // The key request and the code check need a stepped-up session: the user proves it before the setup opens.
    const steppedUp = await ensureStepUp().then(
      () => true,
      () => false,
    );
    if (!steppedUp) return;

    dialoger.getState().create(
      <Suspense fallback={<Skeleton className="mx-auto my-3 size-72.75" />}>
        <TotpSetup />
      </Suspense>,
      {
        id: 'totp-setup',
        title: t('c:totp_qr.title'),
        description: t('c:totp_qr.description'),
        triggerRef,
        className: 'sm:max-w-md',
        drawerOnMobile: false,
      },
    );
  };

  const handleDeleteTotp = () => {
    if (!onlineManager.isOnline()) return toastOffline();
    deleteTotp();
  };

  if (!totp)
    return (
      <div className="mb-6">
        <Button ref={triggerRef} variant="secondary" className="max-sm:w-full" onClick={openTotpSetup}>
          <RotateCcwKeyIcon />
          {t('c:totp_setup')}
        </Button>
      </div>
    );

  return (
    <div className="mb-6">
      <ExpandableTile
        value="totp"
        icon={<RotateCcwKeyIcon />}
        title={t('c:authenticator_app')}
        meta={
          totp.lastUsedAt ? (
            <>
              {t('c:last_used')} <RelativeDate date={totp.lastUsedAt} />
            </>
          ) : (
            t('c:never_used')
          )
        }
        details={
          <>
            <ExpandableTileDetail label={t('c:created_at')}>{dateShort(totp.createdAt)}</ExpandableTileDetail>
            {totp.lastUsedAt && <ExpandableTileDetail label={t('c:last_used')}>{dateShort(totp.lastUsedAt)}</ExpandableTileDetail>}
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              className="max-sm:w-full"
              loading={isPending}
              disabled={user.mfaRequired}
              onClick={handleDeleteTotp}
            >
              <TrashIcon />
              {t('c:delete')}
            </Button>
            {user.mfaRequired && <p className="text-muted-foreground text-sm">{t('c:totp_locked.text')}</p>}
          </>
        }
      />
    </div>
  );
}
