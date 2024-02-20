import { zodResolver } from '@hookform/resolvers/zod';
import React, { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

// Change this in the future on current schema
// import { sendNewsletterJsonSchema } from 'backend/modules/organizations/schema';
import { sendNewsletter } from '~/api/organizations';

import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { useFormWithDraft } from '~/hooks/use-draft-form';
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
  const [apiWrapper, pending] = useApiWrapper();

  const form = useFormWithDraft<FormValues>('send-newsletter', {
    resolver: zodResolver(formSchema),
    defaultValues: {
      organizationIds: [],
      subject: '',
      content: '',
    },
  });

  const onSubmit = (values: FormValues) => {
    // TODO
    const organizationIds = ['1', '2', '3'];
    apiWrapper(
      () => sendNewsletter(organizationIds, values.subject, values.content),
      (result) => {
        form.reset();
        console.log(result);

        toast.success(t('success.create_newsletter'));

        if (isSheet) {
          sheet.remove();
        }
      },
    );
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
              <FormLabel>{t('label.subject')}</FormLabel>
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
          <Button type="submit" disabled={!form.formState.isDirty} loading={pending}>
            <Send size={16} className="mr-2" />
            {t('action.send')}
          </Button>
          <Button type="reset" variant="secondary" className={form.formState.isDirty ? '' : 'sm:invisible'} aria-label="Cancel" onClick={cancel}>
            {t('action.cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default NewsletterForm;
