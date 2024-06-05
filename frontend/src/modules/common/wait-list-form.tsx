import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { actionRequestSchema } from 'backend/modules/general/schema';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type * as z from 'zod';

import { config } from 'config';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { requestAction as baserequestAction } from '~/api/general';
import { useMutation } from '~/hooks/use-mutations';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { LegalText } from '../marketing/legals';
import { dialog } from './dialoger/state';

const formSchema = actionRequestSchema;

export const WaitListForm = ({ email, setStep }: { email: string; setStep: (step: string) => void }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { mutate: requestAction, isPending } = useMutation({
    mutationFn: baserequestAction,
    onSuccess: () => {
      navigate({
        to: '/about',
        replace: true,
      });
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: email,
      userId: null,
      organizationId: null,
      type: 'WAITLIST_REQUEST',
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    requestAction({
      email: values.email,
      type: 'WAITLIST_REQUEST',
    });
  };

  return (
    <Form {...form}>
      <div className="text-2xl text-center">
        <h1 className="text-xxl">{t('common:request_access')}</h1>
        <Button variant="ghost" onClick={() => setStep('check')} className="font-light mt-1 text-xl">
          {email}
          <ChevronDown size={16} className="ml-2" />
        </Button>
      </div>
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
        <Button type="submit" loading={isPending} className="w-full">
          {t('common:put_on_wait_list')}
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
    <p className="font-light text-base text-center space-x-1">
      <span>{t('common:legal_notice_access_request.text')}</span>
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
