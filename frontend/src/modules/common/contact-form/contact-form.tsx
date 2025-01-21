import { zodResolver } from '@hookform/resolvers/zod';

import { Mail, MessageSquare, Send, User } from 'lucide-react';
import type { SubmitHandler } from 'react-hook-form';
import * as z from 'zod';
import { isDialog as checkDialog, dialog } from '~/modules/common/dialoger/state';

import { Suspense, lazy, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { createToast } from '~/lib/toasts';
import InputFormField from '~/modules/common/form-fields/input';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import { useCreateRequestsMutation } from '~/modules/requests/query-mutations';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';
import { useUserStore } from '~/store/user';
import { createRequestSchema } from '#/modules/requests/schema';

const ContactFormMap = lazy(() => import('~/modules/common/contact-form/contact-form-map'));

// Main contact form map component
const ContactForm = ({ dialog: isDialog }: { dialog?: boolean }) => {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const isMediumScreen = useBreakpoints('min', 'md');

  const formSchema = createRequestSchema.extend({ name: z.string().min(2, t('common:error.name_required')).default('') });

  type FormValues = z.infer<typeof formSchema>;

  const form = useFormWithDraft<FormValues>('contact-form', {
    resolver: zodResolver(formSchema),
    defaultValues: { name: user?.name || '', email: user?.email || '', message: '', type: 'contact' },
  });

  const cancel = () => {
    form.reset();
    isDialog && dialog.remove();
  };

  const { mutate: createRequest } = useCreateRequestsMutation();

  const onSubmit: SubmitHandler<FormValues> = (body) => {
    createRequest(body, {
      onSuccess: () => {
        createToast(t('common:message_sent.text'), 'success');
        if (isDialog) dialog.remove();
        form.reset();
      },
      onError: () => {
        createToast(t('common:error.reported_try_later'), 'error');
      },
    });
  };

  // Update dialog title with unsaved changes
  useEffect(() => {
    if (form.unsavedChanges) {
      const targetDialog = dialog.get('contact-form');
      if (targetDialog && checkDialog(targetDialog)) {
        dialog.update('contact-form', {
          title: <UnsavedBadge title={targetDialog?.title} />,
        });
      }
      return;
    }
    dialog.reset('contact-form');
  }, [form.unsavedChanges]);

  return (
    <div className="flex w-full gap-8 flex-col md:flex-row">
      <div className="w-full">
        <div className="w-full">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 md:space-y-6">
              <InputFormField control={form.control} name="name" label={t('common:name')} icon={<User size={16} />} />
              <InputFormField control={form.control} name="email" label={t('common:email')} type="email" icon={<Mail size={16} />} required />
              <InputFormField control={form.control} name="message" label={t('common:message')} type="textarea" icon={<MessageSquare size={16} />} />
              <div className="flex flex-col sm:flex-row gap-2">
                <SubmitButton>
                  <Send size={16} className="mr-2" />
                  {t('common:send')}
                </SubmitButton>
                <Button type="reset" variant="secondary" onClick={cancel} className={form.formState.isDirty ? '' : 'invisible'}>
                  {t('common:cancel')}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
      {isMediumScreen && (
        <Suspense>
          <div className="w-full">
            <ContactFormMap />
          </div>
        </Suspense>
      )}
    </div>
  );
};

export default ContactForm;
