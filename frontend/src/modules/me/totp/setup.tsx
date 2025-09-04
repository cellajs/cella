import { useSuspenseQuery } from '@tanstack/react-query';
import { CopyCheckIcon, CopyIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getToptUri } from '~/api.gen';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { TOPTVerificationForm } from '~/modules/me/totp/verification-form';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/modules/ui/card';
import { useUIStore } from '~/store/ui';

export const TOTPSetup = () => {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const { data } = useSuspenseQuery({
    queryKey: ['totp', 'uri'],
    queryFn: async () => await getToptUri(),
    staleTime: 0,
  });

  const openSetUpKey = () => {
    useDialoger.getState().create(<TOPTManualKey manualKey={data.manualKey} />, {
      id: '2fa-key',
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
          <QRCodeSVG className="mx-auto my-3" value={data.totpUri} size={200} />
        </CardContent>
        <CardFooter className="flex flex-col items-start p-6">
          <h3>{t('common:totp_manual.footer_title')}</h3>

          <span className="text-sm">
            {t('common:totp_manual.footer_description')}

            <Button ref={triggerRef} variant="none" className="p-0 h-auto underline cursor-pointer" onClick={openSetUpKey}>
              {t('common:totp_manual.button_text')}
            </Button>
          </span>
          <TOPTVerificationForm mode={'setup'} />
        </CardFooter>
      </Card>
    </div>
  );
};

const TOPTManualKey = ({ manualKey }: { manualKey: string }) => {
  const { t } = useTranslation();
  const { copyToClipboard, copied } = useCopyToClipboard();

  return (
    <div className="flex flex-col gap-3 p-4">
      <h3 className="font-semibold">{t('common:totp_manual.title')}</h3>
      <p className="text-sm">{t('common:totp_manual.description')}</p>
      <div className="flex items-center justify-between bg-card gap-2 text-card-foreground rounded-lg rounded px-3 py-2 font-mono text-lg">
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
