import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { QrCode, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getToptUri } from '~/api.gen';
import { ApiError } from '~/lib/api';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import Spinner from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/modules/ui/card';
import { useUIStore } from '~/store/ui';

export const TOPTOption = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mode = useUIStore((state) => state.mode);

  const [showCard, setShowCard] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const { data, error } = useQuery({
    queryKey: ['totp', 'uri'],
    queryFn: async () => await getToptUri(),
    enabled: showCard,
    staleTime: 0,
  });

  const openSetUpKey = () => {
    useDialoger.getState().create(
      <div className="p-4">
        <h3 className="font-semibold text-lg mb-2">Manual Setup</h3>
        <p className="text-sm text-gray-600 mb-4">If you can’t scan the QR code, enter this key into your authenticator app:</p>
        <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 rounded px-3 py-2 mb-2 font-mono text-lg">
          <span>{data?.manualKey}</span>
        </div>
        <p className="text-xs text-gray-500">Keep this key private — anyone with it can generate codes for your account.</p>
      </div>,
      {
        id: '2fa-key',
        triggerRef,
        className: 'sm:max-w-md',
        drawerOnMobile: false,
        hideClose: false,
      },
    );
  };

  useEffect(() => {
    if (error instanceof ApiError) throw navigate({ to: '/error', search: { error: error.type, severity: error.severity } });
  }, [error]);

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      {showCard ? (
        <Card className="bg-background relative">
          <CardHeader className="flex items-start p-4">
            <CardTitle>{t('common:totp.scan_qr')}</CardTitle>
            <CardDescription>{t('common:totp.scan_qr.text')}</CardDescription>
          </CardHeader>
          <CardContent>
            {data ? <QRCodeSVG className="mx-auto my-5" value={data.totpUri} size={200} /> : <Spinner />}

            <Button
              size="xs"
              variant="outline"
              className="ring-offset-background focus-visible:ring-ring absolute right-3 top-3 p-2 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden sm:focus-visible:ring-2 focus-visible:ring-offset-2"
              onClick={() => setShowCard(false)}
            >
              <X size={16} strokeWidth={1.25} />
            </Button>
          </CardContent>
          <CardFooter className="flex flex-col items-start">
            <h3>{t('common:totp.manually')}</h3>
            <div>
              <span>{t('common:totp.manually.text')}</span>
              <Button ref={triggerRef} variant="none" className="underline cursor-pointer" onClick={openSetUpKey}>
                Show Setup Key
              </Button>
            </div>
          </CardFooter>
        </Card>
      ) : (
        <Button type="button" onClick={() => setShowCard(true)} variant="plain" className="w-full gap-1.5">
          <QrCode size={16} />
          <span>
            {t('common:sign_in')} {t('common:with').toLowerCase()} {t('common:totp').toLowerCase()}
          </span>
        </Button>
      )}
    </div>
  );
};
