import { zodResolver } from '@hookform/resolvers/zod';

import { Mail, MessageSquare, Send, User } from 'lucide-react';
import type { SubmitHandler } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';
import { isDialog as checkDialog, dialog } from '~/modules/common/dialoger/state';

import { Suspense, lazy, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createRequest as baseCreateRequest } from '~/api/requests';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { i18n } from '~/lib/i18n';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import { Button } from '~/modules/ui/button';
import { Form } from '~/modules/ui/form';
import { useUserStore } from '~/store/user';
import InputFormField from '../form-fields/input';

const ContactFormMap = lazy(() => import('./contact-form-map'));

const formSchema = z.object({
  name: z.string().min(5, i18n.t('common:error.name_required')).default(''),
  email: z.string().email(i18n.t('common:error.invalid_email')).default(''),
  message: z.string().default(''),
});

type FormValues = z.infer<typeof formSchema>;

// Main contact form map component
const ContactForm = ({ dialog: isDialog }: { dialog?: boolean }) => {
  const isMediumScreen = useBreakpoints('min', 'md');
  const { user } = useUserStore(({ user }) => ({ user }));
  const { t } = useTranslation();

  const form = useFormWithDraft<FormValues>('contact-form', {
    resolver: zodResolver(formSchema),
    defaultValues: { name: user?.name || '', email: user?.email || '', message: '' },
  });

  const cancel = () => {
    form.reset();
    isDialog && dialog.remove();
  };

  const { mutate: createRequest } = useMutation({
    mutationFn: baseCreateRequest,
    onSuccess: () => {
      toast.success(t('common:message_sent.text'));
      if (isDialog) dialog.remove();
      form.reset();
    },
    onError: () => {
      toast.error(t('common:error.reported_try_later'));
    },
  });

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    const { name, email, message } = data;
    createRequest({ email, type: 'CONTACT_REQUEST', message: `${name} with the message: ${message}` });
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
              <InputFormField control={form.control} name="name" label={t('common:name')} icon={<User size={16} />} required />
              <InputFormField control={form.control} name="email" label={t('common:email')} type="email" icon={<Mail size={16} />} required />
              <InputFormField control={form.control} name="message" label={t('common:message')} type="textarea" icon={<MessageSquare size={16} />} />
              <div className="flex flex-col sm:flex-row gap-2">
                <Button type="submit">
                  <Send size={16} className="mr-2" />
                  {t('common:send')}
                </Button>
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
