import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { QrCode, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getToptUri } from '~/api.gen';
import { ApiError } from '~/lib/api';
import { TOPTManualKey } from '~/modules/auth/totp/manual-key-card';
import { TOPTVerificationForm } from '~/modules/auth/totp/verification-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import Spinner from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/modules/ui/card';
import { useUIStore } from '~/store/ui';

export const TOTP = () => {
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
    useDialoger.getState().create(<TOPTManualKey manualKey={data?.manualKey} />, {
      id: '2fa-key',
      triggerRef,
      className: 'sm:max-w-md',
      drawerOnMobile: false,
      hideClose: false,
    });
  };

  // TODO find better way to handle error redirect
  useEffect(() => {
    if (error instanceof ApiError) throw navigate({ to: '/error', search: { error: error.type, severity: error.severity } });
  }, [error]);

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      {showCard ? (
        <Card className="bg-background relative">
          <CardHeader className="flex items-start p-6">
            <CardTitle>{t('common:totp_qr.title')}</CardTitle>
            <CardDescription>{t('common:totp_qr.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {data ? <QRCodeSVG className="mx-auto my-3" value={data.totpUri} size={200} /> : <Spinner />}

            <Button
              size="xs"
              variant="outline"
              className="ring-offset-background focus-visible:ring-ring absolute right-3 top-3 p-2 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden sm:focus-visible:ring-2 focus-visible:ring-offset-2"
              onClick={() => setShowCard(false)}
            >
              <X size={16} strokeWidth={1.25} />
            </Button>
          </CardContent>
          <CardFooter className="flex flex-col items-start p-6">
            <h3>{t('common:totp_manual.footer_title')}</h3>

            <span className="text-sm">
              {t('common:totp_manual.footer_description')}

              <Button ref={triggerRef} variant="none" className="p-0 h-auto underline cursor-pointer" onClick={openSetUpKey}>
                {t('common:totp_manual.button_text')}
              </Button>
            </span>
            <TOPTVerificationForm />
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
