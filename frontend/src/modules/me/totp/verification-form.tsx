import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { appConfig } from 'config';
import { useForm, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type z from 'zod';
import { type SignInWithTotpData, type SignInWithTotpResponse, setupTotp, signInWithTotp } from '~/api.gen';
import { zSignInWithTotpData } from '~/api.gen/zod.gen';
import type { ApiError } from '~/lib/api';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/service';
import { SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { useUserStore } from '~/store/user';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

const formSchema = zSignInWithTotpData.shape.body.unwrap();
type FormValues = z.infer<typeof formSchema>;

export const TOPTVerificationForm = ({ mode }: { mode: 'setup' | 'auth' }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const isSetup = mode === 'setup';
  // Set up form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { code: '' },
  });
  const { isValid } = useFormState({ control: form.control });

  const { mutate: TOTPVerification } = useMutation<SignInWithTotpResponse, ApiError | Error, NonNullable<SignInWithTotpData['body']>>({
    mutationFn: async (body) => (isSetup ? await setupTotp({ body }) : await signInWithTotp({ body })),
    onSuccess: (success) => {
      if (!success) {
        toaster(t(`error:${isSetup ? 'totp_setup_failed' : 'totp_verification_failed'}`), 'error');
        return;
      }

      if (!isSetup) {
        navigate({ to: appConfig.defaultRedirectPath, replace: true });
        return;
      }

      useUserStore.getState().setMeAuthData({ hasTotp: true });
    },
    onError: () => toaster(t(`error:${isSetup ? 'totp_setup_failed' : 'totp_verification_failed'}`), 'error'),
  });

  const onSubmit = (body: FormValues) => {
    if (isSetup) useDialoger.getState().remove('2fa-uri');
    TOTPVerification(body);
  };
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, defaultOnInvalid)} className={`flex flex-row gap-2 items-end mt-4 ${!isSetup && 'justify-center'}`}>
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
  );
};
