import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { signUpJsonSchema } from 'backend/modules/auth/schema';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type * as z from 'zod';

import { config } from 'config';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { signUp } from '~/api/authentication';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { PrivacyText } from '../marketing/privacy';
import { TermsText } from '../marketing/terms';

const PasswordStrength = lazy(() => import('~/modules/auth/password-strength'));

const formSchema = signUpJsonSchema;

export const SignUpForm = ({ email, setStep }: { email: string; setStep: (step: string) => void }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [apiWrapper, pending] = useApiWrapper();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: email,
      password: '',
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    apiWrapper(
      () => signUp(values.email, values.password),
      () => {
        navigate({
          to: '/auth/verify-email',
        });
      },
    );
  };

  return (
    <Form {...form}>
      <h1 className="text-2xl text-center">
        {t('common:create_account')}? <br />
        <Button variant="ghost" onClick={() => setStep('check')} className="font-light mt-2 text-xl">
          {email}
          <ChevronDown size={16} className="ml-2" />
        </Button>
      </h1>

      <LegalNotice />

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="hidden">
              <FormControl>
                <Input {...field} type="email" disabled={true} readOnly={true} placeholder={t('common:email')} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="relative">
                  <Input type="password" autoFocus placeholder={t('common:new_password')} autoComplete="new-password" {...field} />
                  <Suspense>
                    <PasswordStrength password={form.getValues('password') || ''} minLength={8} />
                  </Suspense>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" loading={pending} className="w-full">
          {t('common:sign_up')}
          <ArrowRight size={16} className="ml-2" />
        </Button>
      </form>
    </Form>
  );
};

export const LegalNotice = () => {
  const { t } = useTranslation();

  const openDialog = (mode: string) => () => {
    const dialogComponent = mode === 'terms' ? <TermsText /> : <PrivacyText />;
    const dialogTitle = mode;

    dialog(dialogComponent, {
      className: 'md:max-w-xl',
      title: dialogTitle,
    });
  };

  return (
    <p className="font-light text-sm space-x-1">
      <span>{t('common:legal_notice.text')}</span>
      <Button variant="link" className="p-0 h-auto" onClick={openDialog('terms')}>
        {t('common:terms').toLocaleLowerCase()}
      </Button>
      <span>&</span>
      <Button variant="link" className="p-0 h-auto" onClick={openDialog('privacy')}>
        {t('common:privacy_policy').toLocaleLowerCase()}
      </Button>
      <span>of {config.company.name}.</span>
    </p>
  );
};
