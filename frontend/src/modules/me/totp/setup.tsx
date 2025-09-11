import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { CopyCheckIcon, CopyIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type ActivateTotpData, type ActivateTotpResponse, type ApiError, activateTotp, registerTotp } from '~/api.gen';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { TotpConfirmationForm } from '~/modules/auth/totp-verify-code-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/service';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/modules/ui/card';
import { useUIStore } from '~/store/ui';
import { useUserStore } from '~/store/user';

export const SetupTotp = () => {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);

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
      className: 'sm:max-w-md',
      drawerOnMobile: false,
      hideClose: false,
    });
  };

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      <Card className="bg-background relative border-none">
        <CardHeader className="flex items-start p-6">
          <CardTitle>{t('common:totp_qr.title')}</CardTitle>
          <CardDescription>{t('common:totp_qr.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <QRCodeSVG className="mx-auto border-8 border-white my-3" value={data.totpUri} size={275} />

          <Alert variant="secondary" className="my-6">
            <AlertTitle>{t('common:totp_manual.footer_title')}</AlertTitle>
            <AlertDescription className="text-sm font-light">
              <span>{t('common:totp_manual.footer_description')}</span>
              <Button ref={triggerRef} variant="none" className="p-0 h-auto underline cursor-pointer" onClick={openSetUpKey}>
                {t('common:totp_manual.button_text')}
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="flex flex-col items-start">
          <TotpConfirmationForm label={t('common:totp_verify')} onSubmit={onSubmit} onCancel={() => useDialoger.getState().remove('setup-totp')} />
        </CardFooter>
      </Card>
    </div>
  );
};

const TotpManualKey = ({ manualKey }: { manualKey: string }) => {
  const { t } = useTranslation();
  const { copyToClipboard, copied } = useCopyToClipboard();

  return (
    <div className="flex flex-col gap-3 p-4">
      <h3 className="font-semibold">{t('common:totp_manual.title')}</h3>
      <p className="text-sm">{t('common:totp_manual.description')}</p>
      <div className="flex items-center justify-between bg-card gap-2 text-card-foreground rounded-lg px-3 py-2 font-mono text-lg">
        <span>{manualKey}</span>
        <Button
          variant="cell"
          size="icon"
          className="h-full w-full"
          aria-label="Copy"
          data-tooltip="true"
          data-tooltip-content={copied ? t('common:copied') : t('common:copy')}
          onClick={() => copyToClipboard(manualKey)}
        >
          {copied ? <CopyCheckIcon size={16} /> : <CopyIcon size={16} />}
        </Button>
      </div>
      <p className="text-xs text-gray-500">{t('common:totp_manual.secure_text')}</p>
    </div>
  );
};
