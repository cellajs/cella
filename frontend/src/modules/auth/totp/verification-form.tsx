import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { appConfig } from 'config';
import { useForm, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type z from 'zod';
import { type SignInWithTotpData, type SignInWithTotpResponse, signInWithTotp } from '~/api.gen';
import { zSignInWithTotpData } from '~/api.gen/zod.gen';
import type { ApiError } from '~/lib/api';
import { toaster } from '~/modules/common/toaster/service';
import { SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

const formSchema = zSignInWithTotpData.shape.body.unwrap();
type FormValues = z.infer<typeof formSchema>;

export const TOPTVerificationForm = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Set up form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { code: '' },
  });
  const { isValid } = useFormState({ control: form.control });

  const { mutate: TOTPAuth } = useMutation<SignInWithTotpResponse, ApiError | Error, NonNullable<SignInWithTotpData['body']>>({
    mutationFn: async (body) => await signInWithTotp({ body }),
    onSuccess: (success) => {
      if (success) navigate({ to: appConfig.defaultRedirectPath, replace: true });
      else toaster(t('error:totp_failed'), 'error');
    },
    onError: () => toaster(t('error:totp_failed'), 'error'),
  });

  const onSubmit = (body: FormValues) => TOTPAuth(body);
  return (
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
  );
};
