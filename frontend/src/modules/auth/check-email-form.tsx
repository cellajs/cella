import { zodResolver } from '@hookform/resolvers/zod';
import { checkEmailJsonSchema } from 'backend/modules/auth/schema';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type * as z from 'zod';

import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';

import { config } from 'config';
import { ArrowRight } from 'lucide-react';
import { checkEmail as baseCheckEmail } from '~/api/authentication';
import { useMutation } from '~/hooks/use-mutations';
import type { TokenData } from '.';
import { useEffect } from 'react';

const formSchema = checkEmailJsonSchema;

export const CheckEmailForm = ({ tokenData, setStep }: { tokenData: TokenData | null; setStep: (step: string, email: string) => void }) => {
  const { t } = useTranslation();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
    },
  });

  const { mutate: checkEmail, isPending } = useMutation({
    mutationFn: baseCheckEmail,
    onSuccess: (result) => {
      if (config.has.signUp) {
        const nextStep = result.exists ? 'signIn' : 'signUp';
        setStep(nextStep, form.getValues('email'));
      } else {
        const nextStep = result.exists ? 'signIn' : 'inviteOnly';
        setStep(nextStep, form.getValues('email'));
      }
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    checkEmail(values.email);
  };

  const title = config.has.signUp
    ? tokenData
      ? t('common:invite_sign_in_or_up')
      : t('common:sign_in_or_up')
    : tokenData
      ? t('common:invite_sign_in')
      : t('common:sign_in');

  useEffect(() => {
    if (tokenData?.email) {
      form.setValue('email', tokenData.email);
      form.handleSubmit(onSubmit)();
    }
  }, [tokenData]);

  return (
    <Form {...form}>
      <h1 className="text-2xl text-center pb-2 mt-4">{title}</h1>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            // Custom css due to html injection by browser extensions
            <FormItem className="gap-0">
              <FormControl>
                <Input {...field} type="email" autoFocus placeholder={t('common:email')} />
              </FormControl>
              <FormMessage className="mt-2" />
            </FormItem>
          )}
        />
        <Button type="submit" loading={isPending} className="w-full">
          {t('common:continue')}
          <ArrowRight size={16} className="ml-2" />
        </Button>
      </form>
    </Form>
  );
};
