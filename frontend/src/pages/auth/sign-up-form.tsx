import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { signUpJsonSchema } from 'backend/schemas/user';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

import { config } from 'config';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { signUp } from '~/api/api';
import { dialog } from '~/components/dialoger/state';
import { Button } from '~/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/components/ui/form';
import { Input } from '~/components/ui/input';
import { useApiWrapper } from '~/hooks/useApiWrapper';
import { PrivacyText } from '../other/privacy';
import { TermsText } from '../other/terms';

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
        Create account? <br />
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
                <Input {...field} type="email" disabled={true} readOnly={true} placeholder={t('label.email', { defaultValue: 'Email' })} />
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
                <Input
                  type="password"
                  autoFocus
                  placeholder={t('label.new_password', { defaultValue: 'New Password' })}
                  autoComplete="new-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" loading={pending} className="w-full">
          {t('action.sign_up', {
            defaultValue: 'Sign up',
          })}
          <ArrowRight size={16} className="ml-2" />
        </Button>
      </form>
    </Form>
  );
};

export const LegalNotice = () => {
  const openDialog = (mode: string) => () => {
    const dialogComponent = mode === 'terms' ? <TermsText /> : <PrivacyText />;
    const dialogTitle = mode;

    dialog(dialogComponent, {
      className: 'sm:max-w-xl',
      title: dialogTitle,
    });
  };

  return (
    <p className="font-light text-sm space-x-1">
      <span>Set new password or use Github.</span>
      <span>By signing up you agree to the</span>
      <Button variant="link" className="p-0 h-auto" onClick={openDialog('terms')}>
        terms
      </Button>
      <span>&</span>
      <Button variant="link" className="p-0 h-auto" onClick={openDialog('privacy')}>
        privacy policy
      </Button>
      <span>of {config.company.name}.</span>
    </p>
  );
};
