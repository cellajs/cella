import { zodResolver } from '@hookform/resolvers/zod';
import { checkEmailJsonSchema } from 'backend/schemas/user';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

import { Button } from '~/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/components/ui/form';
import { Input } from '~/components/ui/input';

import { ArrowRight } from 'lucide-react';
import { checkEmail } from '~/api/authentication';
import { useApiWrapper } from '~/hooks/useApiWrapper';

const formSchema = checkEmailJsonSchema;

export const CheckEmailForm = ({ setStep }: { setStep: (step: string, email: string) => void }) => {
  const { t } = useTranslation();

  const [apiWrapper, pending] = useApiWrapper();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    apiWrapper(
      () => checkEmail(values.email),
      (result) => {
        const nextStep = result.exists ? 'signIn' : 'signUp';
        setStep(nextStep, values.email);
      },
    );
  };

  return (
    <Form {...form}>
      <h1 className="text-2xl text-center pb-2 mt-4">Sign in or sign up</h1>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input {...field} type="email" autoFocus placeholder={t('label.email', { defaultValue: 'Email' })} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" loading={pending} className="w-full">
          Continue
          <ArrowRight size={16} className="ml-2" />
        </Button>
      </form>
    </Form>
  );
};
