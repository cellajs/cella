import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { authBodySchema } from 'backend/modules/auth/schema';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type * as z from 'zod';

import { onlineManager } from '@tanstack/react-query';
import { config } from 'config';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { Suspense, lazy, useEffect } from 'react';
import { toast } from 'sonner';
import { signUp as baseSignUp } from '~/api/auth';
import { useMutation } from '~/hooks/use-mutations';
import { dialog } from '~/modules/common/dialoger/state';
import { LegalText } from '~/modules/marketing/legals';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import type { TokenData } from '.';

const PasswordStrength = lazy(() => import('~/modules/auth/password-strength'));

const formSchema = authBodySchema;

export const SignUpForm = ({
  tokenData,
  email,
  resetToInitialStep,
}: { tokenData: TokenData | null; email: string; resetToInitialStep: () => void }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { mutate: signUp, isPending } = useMutation({
    mutationFn: baseSignUp,
    onSuccess: () => {
      const to = tokenData ? '/auth/invite/$token' : '/auth/verify-email';

      navigate({
        to,
        replace: true,
        params: {
          token: tokenData?.token,
        },
      });
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: email,
      password: '',
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (!onlineManager.isOnline()) return toast.warning(t('common:offline.text'));

    signUp({
      ...values,
      token: tokenData?.token,
    });
  };

  useEffect(() => {
    if (tokenData?.email) {
      form.setValue('email', tokenData.email);
    }
  }, [tokenData]);

  return (
    <Form {...form}>
      <h1 className="text-2xl text-center">
        {tokenData ? t('common:invite_create_account') : `${t('common:create_resource', { resource: t('common:account').toLowerCase() })}?`} <br />
        {!tokenData && (
          <Button variant="ghost" onClick={resetToInitialStep} className="font-light mt-2 text-xl">
            {email}
            <ChevronDown size={16} className="ml-2" />
          </Button>
        )}
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
            // Custom css due to html injection by browser extensions
            <FormItem className="gap-0">
              <FormControl>
                <div className="relative">
                  <Input type="password" autoFocus placeholder={t('common:new_password')} autoComplete="new-password" {...field} />
                  <Suspense>
                    <PasswordStrength password={form.getValues('password') || ''} minLength={8} />
                  </Suspense>
                </div>
              </FormControl>
              <FormMessage className="mt-2" />
            </FormItem>
          )}
        />
        <Button type="submit" loading={isPending} className="w-full">
          {t('common:sign_up')}
          <ArrowRight size={16} className="ml-2" />
        </Button>
      </form>
    </Form>
  );
};

export const LegalNotice = () => {
  const { t } = useTranslation();

  const openDialog = (mode: 'terms' | 'privacy') => () => {
    const dialogComponent = <LegalText textFor={mode} />;
    const dialogTitle = mode;

    dialog(dialogComponent, {
      className: 'md:max-w-xl',
      title: dialogTitle,
    });
  };

  return (
    <p className="font-light text-sm text-center space-x-1">
      <span>{t('common:legal_notice.text')}</span>
      <Button type="button" variant="link" className="p-0 h-auto" onClick={openDialog('terms')}>
        {t('common:terms').toLocaleLowerCase()}
      </Button>
      <span>&</span>
      <Button type="button" variant="link" className="p-0 h-auto" onClick={openDialog('privacy')}>
        {t('common:privacy_policy').toLocaleLowerCase()}
      </Button>
      <span>of {config.company.name}.</span>
    </p>
  );
};
