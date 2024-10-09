import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { authBodySchema } from 'backend/modules/auth/schema';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type * as z from 'zod';

import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';

import { onlineManager } from '@tanstack/react-query';
import { config } from 'config';
import { ArrowRight, ChevronDown, Send } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { sendResetPasswordEmail as baseSendResetPasswordEmail, signIn as baseSignIn } from '~/api/auth';
import { useMutation } from '~/hooks/use-mutations';
import { dialog } from '~/modules/common/dialoger/state';
import { SignInRoute } from '~/routes/auth';
import { useUserStore } from '~/store/user';
import type { TokenData } from '.';

const formSchema = authBodySchema;

export const SignInForm = ({
  tokenData,
  email,
  resetToInitialStep,
}: { tokenData: TokenData | null; email: string; resetToInitialStep: () => void }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lastUser, clearLastUser } = useUserStore();

  const { redirect } = useSearch({ from: SignInRoute.id });

  const { mutate: signIn, isPending } = useMutation({
    mutationFn: baseSignIn,
    onSuccess: () => {
      // Redirect to the invite page if token is present
      // Otherwise, redirect to a redirect URL or to home
      const to = tokenData ? '/auth/invite/$token' : redirect || config.defaultRedirectPath;
      const params = { token: tokenData?.token };

      navigate({ to, params, replace: true });
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
    const token = tokenData?.token;
    signIn({ ...values, token });
  };

  const cancel = () => {
    clearLastUser();
    resetToInitialStep();
  };

  useEffect(() => {
    if (tokenData?.email) form.setValue('email', tokenData.email);
  }, [tokenData]);

  return (
    <Form {...form}>
      <h1 className="text-2xl text-center">
        {tokenData ? t('common:invite_sign_in') : lastUser ? t('common:welcome_back') : t('common:sign_in_as')} <br />
        {!tokenData && (
          <Button variant="ghost" onClick={cancel} className="font-light mt-2 text-xl">
            {email}
            <ChevronDown size={16} className="ml-2" />
          </Button>
        )}
      </h1>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 !mt-0">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="hidden">
              <FormControl>
                <Input {...field} disabled type="email" autoComplete="off" placeholder={t('common:email')} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {config.enabledAuthenticationStrategies.includes('password') && (
          <>
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                // Custom css due to html injection by browser extensions
                <FormItem className="gap-0">
                  <FormControl>
                    <Input type="password" autoFocus {...field} autoComplete="current-password" placeholder={t('common:password')} />
                  </FormControl>
                  <FormMessage className="mt-2" />
                </FormItem>
              )}
            />

            <Button type="submit" loading={isPending} className="w-full">
              {t('common:sign_in')}
              <ArrowRight size={16} className="ml-2" />
            </Button>
            <ResetPasswordRequest email={email} />
          </>
        )}
      </form>
    </Form>
  );
};

export const ResetPasswordRequest = ({ email }: { email: string }) => {
  const { t } = useTranslation();
  const resetEmailRef = useRef(email);

  const { mutate: sendResetPasswordEmail, isPending } = useMutation({
    mutationFn: baseSendResetPasswordEmail,
    onSuccess: () => {
      toast.success(t('common:success.reset_link_sent'));
      dialog.remove();
    },
  });

  const handleResetRequestSubmit = () => {
    if (!onlineManager.isOnline()) return toast.warning(t('common:action.offline.text'));

    // TODO maybe find a better way
    dialog.update('send-reset-password', {
      content: (
        <div>
          <Input type="email" className="mb-4" defaultValue={email} />
          <Button className="w-full" loading={true} />
        </div>
      ),
    });
    sendResetPasswordEmail(resetEmailRef.current);
  };

  const openDialog = () => {
    dialog(
      <div>
        <Input
          type="email"
          autoFocus
          className="mb-4"
          placeholder={t('common:email')}
          defaultValue={email} // Set the default value instead of value
          onChange={(e) => {
            resetEmailRef.current = e.target.value;
          }}
          required
        />
        <Button className="w-full" disabled={!resetEmailRef.current} loading={isPending} onClick={handleResetRequestSubmit}>
          <Send size={16} className="mr-2" />
          {t('common:send_reset_link')}
        </Button>
      </div>,
      {
        id: 'send-reset-password',
        className: 'md:max-w-xl',
        title: t('common:reset_password'),
        description: t('common:reset_password.text'),
      },
    );
  };

  return (
    <Button variant="ghost" type="button" size="sm" className="w-full font-normal" onClick={openDialog}>
      {t('common:forgot_password')}
    </Button>
  );
};
