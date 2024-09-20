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
import { LegalNotice } from '~/modules/auth/sign-up-form';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';

const formSchema = createRequestSchema;

export const WaitListForm = ({
  email,
  buttonContent,
  emailField,
  dialog: isDialog,
  setStep,
}: { email: string; buttonContent?: string | React.ReactNode; emailField?: boolean; dialog?: boolean; setStep?: (step: Step) => void }) => {
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
    onError: (error) => toast.info(error.message),
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
            <FormItem className={`${emailField ? '' : 'hidden'}`}>
              <FormControl>
                <Input
                  {...field}
                  className="block w-full rounded-2xl border border-gray-300/40 bg-transparent py-4 pl-6 pr-20 text-base/6 text-gray-200 ring-4 ring-primary/10 transition placeholder:text-gray-300/50 focus:border-gray-300 focus:outline-none focus:ring-primary/20"
                  type="email"
                  disabled={!emailField}
                  readOnly={!emailField}
                  placeholder={t('common:email')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" loading={isPending} className="w-full">
          {buttonContent ? (
            buttonContent
          ) : (
            <>
              {t('common:put_on_wait_list')}
              <ArrowRight size={16} className="ml-2" />
            </>
          )}
        </Button>
      </form>
    </Form>
  );
};
