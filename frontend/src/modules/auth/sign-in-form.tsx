import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { signInJsonSchema } from 'backend/modules/auth/schema';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';

import { ArrowRight, ChevronDown, Send } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { sendResetPasswordEmail, signIn } from '~/api/authentication';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { dialog } from '~/modules/common/dialoger/state';
import { SignInRoute } from '~/router/routeTree';
import { useUserStore } from '~/store/user';
import { User } from '~/types';

const formSchema = signInJsonSchema;

export const SignInForm = ({ email, setStep }: { email: string; setStep: (step: string) => void }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setUser, lastUser, clearLastUser } = useUserStore();

  const { redirect } = useSearch({
    from: SignInRoute.id,
  });

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
      () => signIn(values.email, values.password),
      (result) => {
        setUser(result as User);

        navigate({
          to: redirect || '/',
        });
      },
    );
  };

  const cancel = () => {
    clearLastUser();
    setStep('check');
  };

  return (
    <Form {...form}>
      <h1 className="text-2xl text-center">
        {lastUser ? 'Welcome back' : 'Sign in as'} <br />
        <Button variant="ghost" onClick={cancel} className="font-light mt-2 text-xl">
          {email}
          <ChevronDown size={16} className="ml-2" />
        </Button>
      </h1>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 !mt-0">
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
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input type="password" autoFocus {...field} autoComplete="current-password" placeholder={t('common:password')} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" loading={pending} className="w-full">
          Sign in
          <ArrowRight size={16} className="ml-2" />
        </Button>

        <ResetPasswordRequest email={email} />
      </form>
    </Form>
  );
};

export const ResetPasswordRequest = ({ email }: { email: string }) => {
  const [apiWrapper, pending] = useApiWrapper();
  const resetEmailRef = useRef(email);

  const handleResetRequestSubmit = () => {
    apiWrapper(
      () => sendResetPasswordEmail(resetEmailRef.current),
      () => {
        toast.success('Reset link sent');
        dialog.remove();
      },
    );
  };

  const openDialog = () => {
    return dialog(
      <div>
        <Input
          type="email"
          autoFocus
          className="mb-4"
          placeholder="Email address"
          defaultValue={email} // Set the default value instead of value
          onChange={(e) => {
            resetEmailRef.current = e.target.value;
          }}
          required
        />
        <Button className="w-full" disabled={!resetEmailRef.current} loading={pending} onClick={handleResetRequestSubmit}>
          <Send size={16} className="mr-2" />
          Send reset link
        </Button>
      </div>,
      {
        className: 'md:max-w-xl',
        title: 'Reset password',
        text: 'Enter your email address to receive a link to reset your password.',
      },
    );
  };

  return (
    <Button variant="ghost" type="button" size="sm" className="w-full font-normal !mt-2" onClick={openDialog}>
      Forgot password?
    </Button>
  );
};
