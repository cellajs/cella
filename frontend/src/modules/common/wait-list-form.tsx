import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { createRequestSchema } from 'backend/modules/requests/schema';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type * as z from 'zod';

import { onlineManager } from '@tanstack/react-query';
import { config } from 'config';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { createRequest as baseCreateRequest } from '~/api/requests';
import { useMutation } from '~/hooks/use-mutations';
import { showToast } from '~/lib/taosts-show';
import type { Step } from '~/modules/auth';
import { dialog } from '~/modules/common/dialoger/state';
import { LegalText } from '~/modules/marketing/legals';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';

const formSchema = createRequestSchema;

export const WaitListForm = ({ email, dialog: isDialog, setStep }: { email: string; dialog?: boolean; setStep?: (step: Step) => void }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { mutate: createRequest, isPending } = useMutation({
    mutationFn: baseCreateRequest,
    onSuccess: () => {
      navigate({
        to: '/about',
        replace: true,
      });
      if (isDialog) dialog.remove();
      showToast(t('common:success.waitlist_request', { appName: config.name }), 'success');
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email,
      type: 'waitlist',
      message: null,
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (!onlineManager.isOnline()) return toast.warning(t('common:offline.text'));

    createRequest({
      email: values.email,
      type: values.type,
      message: values.message,
    });
  };

  return (
    <Form {...form}>
      {setStep && (
        <>
          <div className="text-2xl text-center">
            <h1 className="text-xxl">{t('common:request_access')}</h1>

            <Button variant="ghost" onClick={() => setStep('check')} className="font-light mt-1 text-xl">
              {email}
              <ChevronDown size={16} className="ml-2" />
            </Button>
          </div>
          <LegalNotice />
        </>
      )}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className={`${isDialog ? '' : 'hidden'}`}>
              <FormControl>
                <Input {...field} type="email" disabled={!isDialog} readOnly={!isDialog} placeholder={t('common:email')} />
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
