import { zodResolver } from '@hookform/resolvers/zod';

import { Mail, MessageSquare, Send, User } from 'lucide-react';
import type { SubmitHandler, UseFormProps } from 'react-hook-form';
import * as z from 'zod';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';

import { Suspense, lazy, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import InputFormField from '~/modules/common/form-fields/input';
import { toaster } from '~/modules/common/toaster';
import { useCreateRequestMutation } from '~/modules/requests/query';
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

  const formSchema = createRequestSchema.extend({ name: z.string().min(2, t('error:name_required')).default('') });

  type FormValues = z.infer<typeof formSchema>;

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: { name: user?.name || '', email: user?.email || '', message: '', type: 'contact' },
    }),
    [],
  );

  const form = useFormWithDraft<FormValues>('contact-form', { formOptions });

  const cancel = () => {
    form.reset();
  };

  const { mutate: createRequest } = useCreateRequestMutation();

  const onSubmit: SubmitHandler<FormValues> = (body) => {
    createRequest(body, {
      onSuccess: () => {
        toaster(t('common:message_sent.text'), 'success');

        if (isDialog) useDialoger.getState().remove();
        form.reset();
      },
      onError: () => {
        toaster(t('error:reported_try_later'), 'error');
      },
    });
  };

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
                  <Send size={16} className="mr-1" />
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
