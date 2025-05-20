import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type * as z from 'zod';
import { createRequestSchema } from '#/modules/requests/schema';

import { onlineManager } from '@tanstack/react-query';
import { config } from 'config';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { LegalNotice } from '~/modules/auth/sign-up-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster';
import { useCreateRequestMutation } from '~/modules/requests/query';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { cn } from '~/utils/cn';

const formSchema = createRequestSchema;

interface WaitlistFormProps {
  email: string;
  buttonContent?: string | React.ReactNode;
  emailField?: boolean;
  dialog?: boolean;
  changeEmail?: () => void;
  callback?: () => void;
  className?: string;
}

export const WaitlistForm = ({ email, buttonContent, emailField, dialog: isDialog, changeEmail, callback, className }: WaitlistFormProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const isMobile = window.innerWidth < 640;

  const { mutate: createRequest, isPending } = useCreateRequestMutation();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email,
      type: 'waitlist',
      message: null,
    },
  });

  const onSubmit = (body: z.infer<typeof formSchema>) => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    createRequest(body, {
      onSuccess: () => {
        navigate({ to: '/about', replace: true });
        toaster(t('common:success.waitlist_request', { appName: config.name }), 'success');

        if (isDialog) useDialoger.getState().remove();
        callback?.();
      },
      onError: (error) => {
        if (callback && error.status === 409) return callback();
      },
    });
  };

  return (
    <Form {...form}>
      {changeEmail && (
        <>
          <div className="text-2xl text-center">
            <h1 className="text-xxl">{t('common:request_access')}</h1>

            <Button variant="ghost" onClick={changeEmail} className="font-light mt-2 text-xl">
              {email}
              <ChevronDown size={16} className="ml-2" />
            </Button>
          </div>
          <LegalNotice email={email} mode="waitlist" />
        </>
      )}
      <form onSubmit={form.handleSubmit(onSubmit)} className={cn('max-xs:min-w-full flex flex-col gap-4 sm:flex-row', className)}>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className={`${emailField ? '' : 'hidden'} grow gap-0`}>
              <FormControl>
                <Input
                  {...field}
                  className="block xs:min-w-80 w-full py-6 h-14 px-8 rounded-full border border-gray-400/40 bg-background/50 text-base/6 ring-4 ring-primary/10 transition focus:border-gray-400 focus:outline-hidden focus-visible:ring-primary/20"
                  type="email"
                  autoFocus={!isMobile}
                  disabled={!emailField}
                  readOnly={!emailField}
                  placeholder={t('common:email')}
                />
              </FormControl>
              <FormMessage className="mt-2" />
            </FormItem>
          )}
        />
        <SubmitButton
          size={buttonContent ? 'default' : 'xl'}
          loading={isPending}
          className={`w-full ${emailField && 'h-14 rounded-full ring-4 sm:max-w-40 ring-primary/10'}`}
        >
          {buttonContent ? (
            buttonContent
          ) : (
            <>
              {t('common:join')}
              <ArrowRight size={16} className="ml-2" />
            </>
          )}
        </SubmitButton>
      </form>
    </Form>
  );
};
