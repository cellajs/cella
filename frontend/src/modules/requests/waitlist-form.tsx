import { onlineManager } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRightIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { zCreateRequestBody } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import type { z } from 'zod';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { toaster, toastOffline } from '~/modules/common/toaster/toaster';
import { useCreateRequestMutation } from '~/modules/requests/query';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/field';
import { Input } from '~/modules/ui/input';
import { cn } from '~/utils/cn';
import { defaultOnInvalid } from '~/utils/form-on-invalid';
import { formResolver } from '~/utils/form-resolver';
import { isTouchInteraction } from '~/utils/input-modality';

/**
 * The pricing page's waitlist dialog, which a `dialog` form closes on success; that page writes the id as a literal.
 * @public
 */
export const waitlistDialogId = 'waitlist-form';

const formSchema = zCreateRequestBody;

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

export function WaitlistForm({ email, inputClassName, buttonContent, buttonClassName, dialog: isDialog, callback, className }: WaitlistFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { mutate: createRequest, isPending } = useCreateRequestMutation();

  const form = useForm<FormValues>({ resolver: formResolver(formSchema), defaultValues: { email: email ?? '', type: 'waitlist', message: null } });
  // An address carried over from the sign-in step stays editable until it is a valid one
  const prefilled = formSchema.shape.email.safeParse(email).success;

  const onSubmit = (body: FormValues) => {
    if (!onlineManager.isOnline()) return toastOffline();

    // Every submission gets the same answer; an address with an account hears it by email.
    createRequest(body, {
      onSuccess: () => {
        navigate({ to: '/about', replace: true });
        toaster.success(t('c:success.waitlist_request', { appName: appConfig.name }));

        if (isDialog) dialoger.getState().remove(waitlistDialogId);
        callback?.({ status: 'success' });
      },
    });
  };

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit, defaultOnInvalid)}
        className={cn('flex items-end gap-4 max-sm:flex-col max-xs:min-w-full', className)}
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className={cn('w-full grow gap-0', prefilled && 'hidden')}>
              <FormControl>
                <Input {...field} className={cn('block', inputClassName)} type="email" autoFocus={!isTouchInteraction()} placeholder={t('c:email')} />
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
              {t('c:join')}
              <ArrowRightIcon />
            </>
          )}
        </SubmitButton>
      </form>
    </Form>
  );
}
