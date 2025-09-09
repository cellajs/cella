import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { appConfig } from 'config';
import { Smartphone } from 'lucide-react';
import { useRef } from 'react';
import { useForm, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type z from 'zod';
import { type SignInWithTotpData, type SignInWithTotpResponse, signInWithTotp } from '~/api.gen';
import { zSignInWithTotpData } from '~/api.gen/zod.gen';
import type { ApiError } from '~/lib/api';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/service';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { useUIStore } from '~/store/ui';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

const formSchema = zSignInWithTotpData.shape.body.unwrap();
type FormValues = z.infer<typeof formSchema>;

export const TOTPStrategy = () => {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const openTOTPVerify = () => {
    useDialoger.getState().create(<DialogConfirmationForm />, {
      id: 'mfa-confirmation',
      triggerRef,
      className: 'sm:max-w-md p-6',
      title: t('common:totp_verify'),
      drawerOnMobile: false,
      hideClose: false,
    });
  };

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      <Button ref={triggerRef} type="button" onClick={openTOTPVerify} variant="plain" className="w-full gap-1.5 truncate">
        <Smartphone size={16} />
        <span className="truncate">
          {t('common:sign_in')} {t('common:with').toLowerCase()} {t('common:authenticator_app').toLowerCase()}
        </span>
      </Button>
    </div>
  );
};

const DialogConfirmationForm = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { code: '' },
  });

  const { isValid, isDirty } = useFormState({ control: form.control });

  const { mutate: totpSignIn } = useMutation<SignInWithTotpResponse, ApiError | Error, NonNullable<SignInWithTotpData['body']>>({
    mutationFn: async (body) => await signInWithTotp({ body }),
    onSuccess: (success) => {
      if (success) navigate({ to: appConfig.defaultRedirectPath, replace: true });
      else toaster(t('error:totp_verification_failed'), 'error');
    },
    onError: () => toaster(t('error:totp_verification_failed'), 'error'),
  });

  const onSubmit = (body: FormValues) => {
    useDialoger.getState().remove('mfa-confirmation');
    totpSignIn(body);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, defaultOnInvalid)} className="flex flex-col gap-4 items-center">
        <FormField
          control={form.control}
          name="code"
          render={({ field: { value, ...rest } }) => (
            <FormItem name="code">
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

        <div className="flex flex-row gap-2">
          <SubmitButton size="sm" variant="darkSuccess" disabled={!isValid} loading={false}>
            {t('common:confirm')}
          </SubmitButton>

          <Button size="sm" type="reset" variant="secondary" disabled={!isDirty} onClick={() => form.reset()}>
            {t('common:clear')}
          </Button>
        </div>
      </form>
    </Form>
  );
};
