import { useSuspenseQuery } from '@tanstack/react-query';
import { RefreshCwIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { TotpConfirmationForm } from '~/modules/auth/totp-confirmation-form';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { InlineLinkButton } from '~/modules/common/inline-link-button';
import { SecretBox } from '~/modules/common/secret-box';
import { totpKeyQueryOptions, useCreateTotpMutation } from '~/modules/me/query';
import { WarningNote } from '~/modules/me/warning-note';
import { Button } from '~/modules/ui/button';

/** The key's challenge cookie lives 5 minutes; the setup expires the key slightly before, to avoid a race. */
const keyExpiryMs = 4.5 * 60 * 1000;

interface TotpSetupProps {
  /** After the key is confirmed; defaults to closing the setup dialog. */
  onDone?: () => void;
  /** Defaults to closing the setup dialog. */
  onCancel?: () => void;
}

/** The QR code of a new authenticator key and the form that confirms it with its first code. */
export function TotpSetup({ onDone, onCancel }: TotpSetupProps) {
  const { t } = useTranslation();

  const [formVersion, setFormVersion] = useState(0);
  const [expiredUri, setExpiredUri] = useState<string | null>(null);

  const { data, refetch, isFetching } = useSuspenseQuery(totpKeyQueryOptions());
  const { mutate: createTotp, isPending } = useCreateTotpMutation();

  // Armed per key, so a wrong code leaves the expiry where it is; the refresh's new key is fresh again.
  useEffect(() => {
    const timer = setTimeout(() => setExpiredUri(data.totpUri), keyExpiryMs);
    return () => clearTimeout(timer);
  }, [data.totpUri]);

  const closeSetup = () => dialoger.getState().remove('totp-setup');

  // A wrong code remounts the form, so the code must be entered again.
  const onSubmit = (body: { code: string }) =>
    createTotp(body, { onSuccess: onDone ?? closeSetup, onError: () => setFormVersion((version) => version + 1) });

  const triggerRef = useRef<HTMLButtonElement>(null);

  const openManualKey = () => {
    dialoger.getState().create(<SecretBox value={data.manualKey} />, {
      id: 'totp-manual-key',
      triggerRef,
      title: t('c:totp_manual'),
      description: t('c:totp_manual.text'),
      className: 'sm:max-w-md',
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <WarningNote className="justify-center">
        <Trans t={t} i18nKey="c:totp_manual_link" components={{ key_anchor: <InlineLinkButton ref={triggerRef} onClick={openManualKey} /> }} />
      </WarningNote>

      <QRCodeSVG className="mx-auto mt-3 mb-6 border-8 border-white" value={data.totpUri} size={275} />
      {expiredUri === data.totpUri ? (
        <div className="flex flex-col items-center gap-3 py-2">
          <p className="text-muted-foreground text-sm">{t('c:totp_qr_expired.text')}</p>
          <Button variant="secondary" loading={isFetching} onClick={() => refetch()}>
            <RefreshCwIcon className="size-3.5" />
            {t('c:refresh')}
          </Button>
        </div>
      ) : (
        <TotpConfirmationForm key={formVersion} onSubmit={onSubmit} loading={isPending} onCancel={onCancel ?? closeSetup} />
      )}
    </div>
  );
}
