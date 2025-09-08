import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { appConfig } from 'config';
import { CopyCheckIcon, CopyIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useRef } from 'react';
import { useForm, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type z from 'zod';
import { type ApiError, getTotpUri, type SetupTotpData, type SetupTotpResponse, setupTotp } from '~/api.gen';
import { zSetupTotpData } from '~/api.gen/zod.gen';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/service';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '~/modules/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { useUIStore } from '~/store/ui';
import { useUserStore } from '~/store/user';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

const formSchema = zSetupTotpData.shape.body;
type FormValues = z.infer<typeof formSchema>;

export const TOTPSetup = () => {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { code: '' },
  });
  const { isValid } = useFormState({ control: form.control });

  const { mutate: validateTotp } = useMutation<SetupTotpResponse, ApiError | Error, NonNullable<SetupTotpData['body']>>({
    mutationFn: async (body) => await setupTotp({ body }),
    onSuccess: (success) => {
      if (success) useUserStore.getState().setMeAuthData({ hasTotp: true });
      else toaster(t('error:totp_setup_failed'), 'error');
    },
    onError: () => toaster(t('error:totp_setup_failed'), 'error'),
  });

  const onSubmit = (body: FormValues) => {
    useDialoger.getState().remove('2fa-uri');
    useDialoger.getState().remove('2fa-key');
    validateTotp(body);
  };

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const { data } = useSuspenseQuery({
    queryKey: ['totp', 'uri'],
    queryFn: async () => await getTotpUri(),
    staleTime: 0,
  });

  const openSetUpKey = () => {
    useDialoger.getState().create(<TotpManualKey manualKey={data.manualKey} />, {
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

          <Alert variant="secondary" className="my-6">
            <AlertTitle>{t('common:totp_manual.footer_title')}</AlertTitle>
            <AlertDescription className="text-sm font-light">
              <span>{t('common:totp_manual.footer_description')}</span>{' '}
              <Button ref={triggerRef} variant="none" className="p-0 h-auto underline cursor-pointer" onClick={openSetUpKey}>
                {t('common:totp_manual.button_text')}
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="flex flex-col items-start">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, defaultOnInvalid)} className="flex flex-row gap-2 items-end mt-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field: { value, ...rest } }) => (
                  <FormItem name="code">
                    <FormLabel className="mb-1">{t('common:totp_verify')}</FormLabel>
                    <FormControl>
                      <Input
                        className="text-center"
                        autoComplete="off"
                        maxLength={appConfig.totpConfig.digits}
                        type="text"
                        pattern="\d*"
                        inputMode="numeric"
                        value={value || ''}
                        {...rest}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <SubmitButton variant="darkSuccess" disabled={!isValid} loading={false}>
                {t('common:confirm')}
              </SubmitButton>
            </form>
          </Form>
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
