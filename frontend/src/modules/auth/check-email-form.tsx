import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { config } from 'config';
import { ArrowRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod/v4';
import type { ApiError } from '~/lib/api';
import type { Step } from '~/modules/auth/types';
import { SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { type CheckEmailData, type CheckEmailResponse, checkEmail } from '~/openapi-client';
import { zCheckEmailData } from '~/openapi-client/zod.gen';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

const formSchema = zCheckEmailData.shape.body.unwrap();

type FormValues = z.infer<typeof formSchema>;
interface CheckEmailProps {
  setStep: (step: Step, email: string) => void;
  emailEnabled: boolean;
}

export const CheckEmailForm = ({ setStep, emailEnabled }: CheckEmailProps) => {
  const { t } = useTranslation();

  const isMobile = window.innerWidth < 640;
  const title = config.has.registrationEnabled ? t('common:sign_in_or_up') : t('common:sign_in');

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '' },
  });

  const { mutate: _checkEmail, isPending } = useMutation<CheckEmailResponse, ApiError, CheckEmailData['body']>({
    mutationFn: (body) => checkEmail({ body, throwOnError: true }),
    onSuccess: () => setStep('signIn', form.getValues('email')),
    onError: (error: ApiError) => {
      let nextStep: Step = 'inviteOnly';

      // If registration is enabled or user has a token, proceed to sign up
      if (config.has.registrationEnabled) nextStep = 'signUp';
      // If registration is disabled and user has no token, proceed to waitlist
      else if (config.has.waitlist) nextStep = 'waitlist';

      if (error.status === 404) return setStep(nextStep, form.getValues('email'));
      return null;
    },
  });

  const onSubmit = (body: FormValues) => _checkEmail(body);

  return (
    <Form {...form}>
      <h1 className="text-2xl text-center pb-2 mt-4">{title}</h1>

      {emailEnabled && (
        <form onSubmit={form.handleSubmit(onSubmit, defaultOnInvalid)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              // Custom css due to html injection by browser extensions
              <FormItem className="gap-0">
                <FormControl>
                  <Input {...field} type="email" autoFocus={!isMobile} placeholder={t('common:email')} />
                </FormControl>
                <FormMessage className="mt-2" />
              </FormItem>
            )}
          />
          <SubmitButton loading={isPending} className="w-full">
            {t('common:continue')}
            <ArrowRight size={16} className="ml-2" />
          </SubmitButton>
        </form>
      )}
    </Form>
  );
};
