import { onlineManager } from '@tanstack/react-query';
import { ArrowRightIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { zCreateRequestBody } from 'sdk/zod.gen';
import type { z } from 'zod';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { NamedText } from '~/modules/common/named-text';
import { SuccessCheckmark } from '~/modules/common/success-checkmark';
import { toaster, toastOffline } from '~/modules/common/toaster/toaster';
import { useCreateRequestMutation } from '~/modules/requests/query';
import type { ButtonProps } from '~/modules/ui/button';
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
  buttonContent?: ReactNode;
  buttonSize?: ButtonProps['size'];
  dialog?: boolean;
  className?: string;
  callback?: (args: CallbackArgs) => void;
}

export function WaitlistForm({ email, inputClassName, buttonContent, buttonSize, dialog: isDialog, callback, className }: WaitlistFormProps) {
  const { t } = useTranslation();
  // Set once a page form is sent; a dialog form closes and toasts.
  const [sentTo, setSentTo] = useState<string | null>(null);

  const { mutate: createRequest, isPending } = useCreateRequestMutation();

  const form = useForm<FormValues>({ resolver: formResolver(formSchema), defaultValues: { email: email ?? '', kind: 'waitlist', message: null } });
  // An address carried over from the sign-in step stays editable until it is a valid one
  const prefilled = formSchema.shape.email.safeParse(email).success;

  const onSubmit = (body: FormValues) => {
    if (!onlineManager.isOnline()) return toastOffline();

    // Every submission gets the same answer; an address with an account hears it by email.
    createRequest(body, {
      onSuccess: () => {
        if (isDialog) {
          toaster.success(t('c:success.waitlist_request'));
          dialoger.getState().remove(waitlistDialogId);
        } else {
          setSentTo(body.email);
        }
        callback?.({ status: 'success' });
      },
    });
  };

  if (sentTo) {
    return (
      <div role="status" className="flex flex-col items-center gap-2 text-center">
        <SuccessCheckmark className="mb-2" />
        <h2 className="text-foreground text-lg font-medium">{t('c:waitlist_request_sent')}</h2>
        <p className="text-muted-foreground">
          <NamedText i18nKey="c:waitlist_request_sent.text" values={{ email: sentTo }} />
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit, defaultOnInvalid)}
        className={cn('max-xs:min-w-full flex items-start gap-4 max-sm:flex-col', className)}
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className={cn('w-full grow', prefilled && 'hidden')}>
              <FormControl>
                <Input {...field} className={inputClassName} type="email" autoFocus={!isTouchInteraction()} placeholder={t('c:email')} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <SubmitButton loading={isPending} size={buttonSize} className="w-full px-6">
          {buttonContent || (
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
