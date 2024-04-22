import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

// Change this in the future on current schema
// import { sendNewsletterJsonSchema } from 'backend/modules/organizations/schema';
import { sendNewsletter as baseSendNewsletter } from '~/api/organizations';

import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { sheet } from '../common/sheeter/state';

const TiptapEditor = lazy(() => import('~/modules/tiptap'));

interface NewsletterFormProps {
  sheet?: boolean;
}

// TODO: Remove this schema once the backend is ready
const formSchema = z.object({
  organizationIds: z.array(z.string()),
  subject: z.string(),
  content: z.string(),
});

// const formSchema = newsletterJsonSchema;

type FormValues = z.infer<typeof formSchema>;

const NewsletterForm: React.FC<NewsletterFormProps> = ({ sheet: isSheet }) => {
  const { t } = useTranslation();

  const form = useFormWithDraft<FormValues>('send-newsletter', {
    resolver: zodResolver(formSchema),
    defaultValues: {
      organizationIds: [],
      subject: '',
      content: '',
    },
  });

  const { mutate: sendNewsletter, isPending } = useMutation({
    mutationFn: baseSendNewsletter,
    onSuccess: () => {
      form.reset();
      toast.success(t('common:success.create_newsletter'));

      if (isSheet) {
        sheet.remove();
      }
    },
  });

  const onSubmit = (values: FormValues) => {
    // TODO
    const organizationIds = ['1', '2', '3'];
    sendNewsletter({
      organizationIds,
      subject: values.subject,
      content: values.content,
    });
  };

  const cancel = () => {
    form.reset();
    if (isSheet) sheet.remove();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} id="tiptap-container" className="space-y-6 h-max">
        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('common:subject')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Suspense fallback={null}>
          <TiptapEditor />
        </Suspense>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="submit" disabled={!form.formState.isDirty} loading={isPending}>
            <Send size={16} className="mr-2" />
            {t('common:send')}
          </Button>
          <Button type="reset" variant="secondary" className={form.formState.isDirty ? '' : 'invisible'} aria-label="Cancel" onClick={cancel}>
            {t('common:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default NewsletterForm;
