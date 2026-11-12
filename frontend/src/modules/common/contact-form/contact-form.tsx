import { MailIcon, MessageSquareIcon, SendIcon, XIcon } from 'lucide-react';
import { Suspense } from 'react';
import type { SubmitHandler, UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { zCreateRequestBody } from 'sdk/zod.gen';
import type { z } from 'zod';
import { useBreakpointAbove } from '~/hooks/use-breakpoints';
import { ContactMethodRows } from '~/modules/common/contact-form/contact-methods';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { CancelButton } from '~/modules/common/form-fields/cancel-button';
import { FormActions } from '~/modules/common/form-fields/form-actions';
import { InputFormField } from '~/modules/common/form-fields/input';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { toaster } from '~/modules/common/toaster/toaster';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { useCreateRequestMutation } from '~/modules/requests/query';
import { Button } from '~/modules/ui/button';
import { DialogClose, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { Form } from '~/modules/ui/field';
import { useUserStore } from '~/modules/user/user-store';
import { formResolver } from '~/utils/form-resolver';
import { lazyNamed } from '~/utils/lazy-named';

const ContactFormMap = lazyNamed(() => import('~/modules/common/contact-form/contact-form-map'), 'ContactFormMap');

export const contactFormDialogId = 'contact-form';

// The request stores an email and a message; a contact request without a message says nothing
const formSchema = zCreateRequestBody.extend({ message: zCreateRequestBody.shape.message.unwrap().trim().min(1) });

type FormValues = z.infer<typeof formSchema>;

interface ContactFormProps {
  /** In the contact dialog, which a sent message closes. */
  dialog?: boolean;
}

export function ContactForm({ dialog: isDialog }: ContactFormProps) {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);
  const isLargeScreen = useBreakpointAbove('lg');

  const formOptions: UseFormProps<FormValues> = {
    resolver: formResolver(formSchema),
    defaultValues: { email: user?.email ?? '', message: '', kind: 'contact' },
  };

  const form = useFormWithDraft<FormValues>('contact-form', { formOptions });

  const { mutate: createRequest, isPending } = useCreateRequestMutation();

  const onSubmit: SubmitHandler<FormValues> = (body) =>
    createRequest(body, {
      onSuccess: () => {
        toaster.success(t('c:success.send_message'));

        if (isDialog) dialoger.getState().remove(contactFormDialogId);
        form.reset();
      },
    });

  const contactForm = (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex w-full flex-col gap-4 md:gap-6">
        <InputFormField
          control={form.control}
          name="email"
          label={t('c:email')}
          labelClassName="max-sm:sr-only"
          type="email"
          autoComplete="email"
          placeholder={t('c:placeholder.your_input', { inputLabel: t('c:email') })}
          icon={<MailIcon />}
          required
        />
        <InputFormField
          control={form.control}
          name="message"
          label={t('c:message')}
          labelClassName="max-sm:sr-only"
          type="textarea"
          inputClassName="min-h-24 sm:min-h-32 lg:min-h-50"
          placeholder={t('c:placeholder.your_input', { inputLabel: t('c:message') })}
          icon={<MessageSquareIcon />}
          required
        />
        <FormActions>
          <SubmitButton loading={isPending} icon={<SendIcon />}>
            {t('c:send')}
          </SubmitButton>
          <CancelButton dirty={form.isDirty} onClick={() => form.reset()} />
        </FormActions>
      </form>
    </Form>
  );

  // The map takes the height of the form beside it
  const map = (
    <Suspense>
      <ContactFormMap />
    </Suspense>
  );

  if (!isDialog)
    return (
      <div className="flex w-full gap-10">
        {contactForm}
        {isLargeScreen && <div className="bg-accent w-full overflow-hidden rounded-md">{map}</div>}
      </div>
    );

  const title = t('c:contact_us');

  // The dialog renders its own header: the map can reach the dialog's edges and carry the close button
  return (
    <div className="grid lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4 lg:p-6">
        <DialogHeader sticky closeButton={!isLargeScreen}>
          <DialogTitle className="h-6 min-w-0 truncate leading-6">
            <UnsavedBadge title={title} />
          </DialogTitle>
        </DialogHeader>
        <DialogDescription>{t('c:contact_us.text')}</DialogDescription>
        {contactForm}
        {!isLargeScreen && <ContactMethodRows className="mt-4" />}
      </div>
      {isLargeScreen && (
        <div className="bg-accent relative overflow-hidden rounded-r-lg">
          {map}
          <DialogClose render={<Button variant="outline" size="icon-xs" />} className="absolute top-3 right-3 rounded-full shadow-sm">
            <XIcon className="size-4" />
            <span className="sr-only">{t('c:close')}</span>
          </DialogClose>
        </div>
      )}
    </div>
  );
}
