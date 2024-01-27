import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from '@tanstack/react-router';
import { resetPasswordJsonSchema } from 'backend/schemas/user';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { Button } from '~/components/ui/button';
import AuthPage from '.';

import { ArrowRight } from 'lucide-react';
import { resetPassword } from '~/api/api';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/components/ui/form';
import { Input } from '~/components/ui/input';
import { useApiWrapper } from '~/hooks/useApiWrapper';

const formSchema = resetPasswordJsonSchema;

const ResetPassword = () => {
  const { t } = useTranslation();
  const { token }: { token: string } = useParams({ strict: false });
  const navigate = useNavigate();

  const [apiWrapper, pending] = useApiWrapper();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: '',
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    apiWrapper(
      () => resetPassword(token, values.password),
      () => {
        navigate({
          to: '/',
        });
      },
    );
  };

  return (
    <AuthPage>
      <Form {...form}>
        <h1 className="text-2xl text-center">
          Reset password <br /> <span className="font-light text-xl">for {'"email here"'}</span>
        </h1>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    type="password"
                    autoFocus
                    placeholder={t('label.new_password', { defaultValue: 'New password' })}
                    autoComplete="new-password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" loading={pending} className="w-full">
            {t('action.reset', {
              defaultValue: 'Reset',
            })}
            <ArrowRight size={16} className="ml-2" />
          </Button>
        </form>
      </Form>
    </AuthPage>
  );
};

export default ResetPassword;
