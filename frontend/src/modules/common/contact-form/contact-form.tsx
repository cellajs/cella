import { MailIcon, MessageSquareIcon, SendIcon } from 'lucide-react';
import { Suspense } from 'react';
import type { SubmitHandler, UseFormProps } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { zCreateRequestBody } from 'sdk/zod.gen';
import type { z } from 'zod';
import { useBreakpointAbove } from '~/hooks/use-breakpoints';
import { LegalContact } from '~/modules/auth/legal/legal-contact';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { CancelButton } from '~/modules/common/form-fields/cancel-button';
import { InputFormField } from '~/modules/common/form-fields/input';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { toaster } from '~/modules/common/toaster/toaster';
import { useCreateRequestMutation } from '~/modules/requests/query';
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
  /** Rendered in the contact dialog, which a sent message closes. */
  dialog?: boolean;
}

export function ContactForm({ dialog: isDialog }: ContactFormProps) {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);
  const isLargeScreen = useBreakpointAbove('lg');
  const emailLabel = t('c:email').toLowerCase();
  const messageLabel = t('c:message').toLowerCase();

  const formOptions: UseFormProps<FormValues> = {
    resolver: formResolver(formSchema),
    defaultValues: { email: user?.email ?? '', message: '', type: 'contact' },
  };

  const form = useFormWithDraft<FormValues>('contact-form', { formOptions });

  const { mutate: createRequest, isPending } = useCreateRequestMutation();

  const onSubmit: SubmitHandler<FormValues> = (body) => {
    createRequest(body, {
      onSuccess: () => {
        toaster.success(t('c:message_sent.text'));

        if (isDialog) dialoger.getState().remove(contactFormDialogId);
        form.reset();
      },
    });
  };

  return (
    <div className="flex w-full flex-col gap-4 md:flex-row md:gap-10">
      <Form {...form}>
        <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex w-full flex-col gap-4 md:gap-6">
          <InputFormField
            control={form.control}
            name="email"
            label={t('c:email')}
            labelClassName="max-sm:sr-only"
            type="email"
            autoComplete="email"
            placeholder={t('c:placeholder.your_input', { inputLabel: emailLabel })}
            icon={<MailIcon />}
            required
          />
          <InputFormField
            control={form.control}
            name="message"
            label={t('c:message')}
            labelClassName="max-sm:sr-only"
            type="textarea"
            placeholder={t('c:placeholder.your_input', { inputLabel: messageLabel })}
            icon={<MessageSquareIcon />}
            required
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <SubmitButton loading={isPending} icon={<SendIcon />}>
              {t('c:send')}
            </SubmitButton>
            <CancelButton dirty={form.isDirty} onClick={() => form.reset()} />
          </div>
        </form>
      </Form>
      {isLargeScreen ? (
        <div className="mb-12 w-full overflow-hidden rounded-md bg-accent">
          <Suspense>
            <ContactFormMap />
          </Suspense>
        </div>
      ) : (
        <LegalContact className="my-4 w-full sm:my-0" addressOnly />
      )}
    </div>
  );
}
