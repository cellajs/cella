import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { CircleAlert, CopyCheckIcon, CopyIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type ActivateTotpData, type ActivateTotpResponse, type ApiError, activateTotp, registerTotp } from '~/api.gen';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { TotpConfirmationForm } from '~/modules/auth/totp-verify-code-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/service';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';

export const SetupTotp = () => {
  const { t } = useTranslation();

  // Mutation to validate and activate TOTP with the provided code
  const { mutate } = useMutation<ActivateTotpResponse, ApiError | Error, NonNullable<ActivateTotpData['body']>>({
    mutationFn: async (body) => await activateTotp({ body }),
    onSuccess: (success) => {
      if (success) useUserStore.getState().setMeAuthData({ hasTotp: true });
      else toaster(t('error:totp_setup_failed'), 'error');
    },
    onError: () => toaster(t('error:totp_setup_failed'), 'error'),
  });

  const onSubmit = (body: { code: string }) => {
    useDialoger.getState().remove('setup-totp');
    useDialoger.getState().remove('mfa-key');
    mutate(body);
  };

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Fetch TOTP registration data (URI and manual key)
  const { data } = useSuspenseQuery({
    queryKey: ['totp', 'uri'],
    queryFn: async () => await registerTotp(),
    staleTime: 0,
  });

  const openSetUpKey = () => {
    useDialoger.getState().create(<TotpManualKey manualKey={data.manualKey} />, {
      id: 'mfa-key',
      triggerRef,
      title: t('common:totp_manual.title'),
      description: t('common:totp_manual.description'),
      className: 'sm:max-w-md',
      drawerOnMobile: false,
      hideClose: false,
    });
  };

  return (
    <div className="group flex flex-col space-y-2">
      <div className="flex gap-2 items-center justify-center">
        <CircleAlert size={14} className="shrink-0 text-amber-500" />
        <div className="text-sm text-muted-foreground">
          <span>{t('common:totp_manual.footer_description')}</span>
          <Button ref={triggerRef} variant="none" className="p-0 h-auto underline inline cursor-pointer" onClick={openSetUpKey}>
            {t('common:totp_manual.button_text')}
          </Button>
        </div>
      </div>

      <QRCodeSVG className="mx-auto border-8 border-white my-3 mb-6" value={data.totpUri} size={275} />
      <TotpConfirmationForm label={t('common:totp_verify')} onSubmit={onSubmit} onCancel={() => useDialoger.getState().remove('setup-totp')} />
    </div>
  );
};

const TotpManualKey = ({ manualKey }: { manualKey: string }) => {
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
};
