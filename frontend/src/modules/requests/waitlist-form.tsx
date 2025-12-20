import { zodResolver } from '@hookform/resolvers/zod';
import { onlineManager } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { appConfig } from 'config';
import { ArrowRightIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { zCreateRequestData } from '~/api.gen/zod.gen';
import { CallbackArgs } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/service';
import { useCreateRequestMutation } from '~/modules/requests/query';
import { SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { cn } from '~/utils/cn';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

const formSchema = zCreateRequestData.shape.body;

type FormValues = z.infer<typeof formSchema>;

interface WaitlistFormProps {
  email?: string;
  inputClassName?: string;
  buttonContent?: string | React.ReactNode;
  buttonClassName?: string;
  dialog?: boolean;
  className?: string;
  callback?: (args: CallbackArgs) => void;
}

/**
 * Waitlist form to request access to application. Can be used in dialog or embedded in an (auth) page layout.
 */
export const WaitlistForm = ({
  email,
  inputClassName,
  buttonContent,
  buttonClassName,
  dialog: isDialog,
  callback,
  className,
}: WaitlistFormProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const isMobile = window.innerWidth < 640;

  const { mutate: createRequest, isPending } = useCreateRequestMutation();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email, type: 'waitlist', message: null },
  });

  const onSubmit = (body: FormValues) => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    createRequest(body, {
      onSuccess: () => {
        navigate({ to: '/about', replace: true });
        toaster(t('common:success.waitlist_request', { appName: appConfig.name }), 'success');

        if (isDialog) useDialoger.getState().remove();
        callback?.({ status: 'success' });
      },
      onError: (error) => {
        if (callback && error.status === 409) {
          callback({ error, status: 'fail' });
          return;
        }
      },
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, defaultOnInvalid)}
        className={cn('max-xs:min-w-full flex max-sm:flex-col items-end gap-4', className)}
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className={`${!email ? '' : 'hidden'} grow gap-0 w-full`}>
              <FormControl>
                <Input
                  {...field}
                  className={cn('block', inputClassName)}
                  type="email"
                  autoFocus={!isMobile}
                  disabled={!!email}
                  readOnly={!!email}
                  placeholder={t('common:email')}
                />
              </FormControl>
              <FormMessage className="mt-2" />
            </FormItem>
          )}
        />
        <SubmitButton loading={isPending} className={cn('w-full px-6', buttonClassName)}>
          {buttonContent ? (
            buttonContent
          ) : (
            <>
              {t('common:join')}
              <ArrowRightIcon size={16} className="ml-2" />
            </>
          )}
        </SubmitButton>
      </form>
    </Form>
  );
};
