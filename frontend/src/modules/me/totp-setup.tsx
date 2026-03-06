import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { CircleAlertIcon, CopyCheckIcon, CopyIcon, RefreshCwIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, type CreateTotpData, type CreateTotpResponses, createTotp, generateTotpKey } from '~/api.gen';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { TotpConfirmationForm } from '~/modules/auth/totp-verify-code-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';

/**
 * A component that sets up TOTP for the user, including displaying a QR code, manual setup key fallback, and handling TOTP verification.
 */
export const SetupTotp = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [formVersion, setFormVersion] = useState(0);
  const [expired, setExpired] = useState(false);

  // Cookie TTL is 5 minutes — expire slightly before to avoid race
  useEffect(() => {
    const timer = setTimeout(() => setExpired(true), 4.5 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [formVersion]);

  // Mutation to validate and activate TOTP with provided code
  const { mutate, isPending } = useMutation<
    CreateTotpResponses[201],
    ApiError | Error,
    NonNullable<CreateTotpData['body']>
  >({
    mutationFn: async (body) => await createTotp({ body }),
    onSuccess: () => {
      useDialoger.getState().remove('setup-totp');
      useUserStore.getState().setMeAuthData({ hasTotp: true });
      toaster(t('common:success.totp_added'), 'success');
    },
    onError: () => {
      // Reset form component to force re-entry of TOTP verify code
      setFormVersion((v) => v + 1);
    },
  });

  const onSubmit = (body: { code: string }) => {
    mutate(body);
  };

  const regenerate = () => {
    queryClient.invalidateQueries({ queryKey: ['totp', 'uri'] });
    setExpired(false);
    setFormVersion((v) => v + 1);
  };

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Fetch TOTP registration data (URI and manual key)
  const { data } = useSuspenseQuery({
    queryKey: ['totp', 'uri'],
    queryFn: async () => await generateTotpKey(),
    staleTime: 0,
  });

  const openManualKey = () => {
    useDialoger.getState().create(<TotpManualKey manualKey={data.manualKey} />, {
      id: 'mfa-key',
      triggerRef,
      title: t('common:totp_manual.title'),
      description: t('common:totp_manual.description'),
      className: 'sm:max-w-md',
      showCloseButton: true,
    });
  };

  return (
    <div className="group flex flex-col space-y-2">
      <div className="flex gap-2 items-center justify-center">
        <CircleAlertIcon size={14} className="shrink-0 text-amber-500" />
        <div className="text-sm text-muted-foreground">
          <span>{t('common:totp_manual.footer_description')}</span>
          <Button
            ref={triggerRef}
            variant="none"
            className="p-0 h-auto underline inline cursor-pointer"
            onClick={openManualKey}
          >
            {t('common:totp_manual.button_text')}
          </Button>
        </div>
      </div>

      <QRCodeSVG className="mx-auto border-8 border-white my-3 mb-6" value={data.totpUri} size={275} />
      {expired ? (
        <div className="flex flex-col items-center gap-3 py-2">
          <p className="text-sm text-muted-foreground">{t('common:totp_qr.expired')}</p>
          <Button variant="plain" onClick={regenerate}>
            <RefreshCwIcon size={14} />
            {t('common:refresh')}
          </Button>
        </div>
      ) : (
        <TotpConfirmationForm
          key={formVersion}
          label={t('common:totp_verify')}
          onSubmit={onSubmit}
          isPending={isPending}
          onCancel={() => useDialoger.getState().remove('setup-totp')}
        />
      )}
    </div>
  );
};

/**
 * A component that displays the manual TOTP setup key in a dialog.
 */
function TotpManualKey({ manualKey }: { manualKey: string }) {
  const { t } = useTranslation();
  const { copyToClipboard, copied } = useCopyToClipboard();

  return (
    <div className="flex truncate bg-card gap-2 text-card-foreground rounded-lg px-3 py-2 font-mono sm:text-lg">
      <div className="truncate w-full grow">{manualKey}</div>
      <Button
        variant="cell"
        size="icon"
        className="h-full"
        aria-label="Copy"
        data-tooltip="true"
        data-tooltip-content={copied ? t('common:copied') : t('common:copy')}
        onClick={() => copyToClipboard(manualKey)}
      >
        {copied ? <CopyCheckIcon size={16} /> : <CopyIcon size={16} />}
      </Button>
    </div>
  );
}
