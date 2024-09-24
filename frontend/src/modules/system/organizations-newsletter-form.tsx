import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { sendNewsletterBodySchema } from 'backend/modules/organizations/schema';
import { sendNewsletter as baseSendNewsletter } from '~/api/organizations';
import '@blocknote/shadcn/style.css';
import { onlineManager } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { sheet } from '~/modules/common/sheeter/state';
import BlockNote from '~/modules/system/org-newsletter-blocknote';
import { Button } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';

interface NewsletterFormProps {
  organizationIds: string[];
  dropSelectedOrganization?: () => void;
  sheet?: boolean;
}

const formSchema = sendNewsletterBodySchema;

type FormValues = z.infer<typeof formSchema>;

const OrganizationsNewsletterForm: React.FC<NewsletterFormProps> = ({ organizationIds, sheet: isSheet, dropSelectedOrganization }) => {
  const { t } = useTranslation();

  const form = useFormWithDraft<FormValues>('send-newsletter', {
    resolver: zodResolver(formSchema),
    defaultValues: {
      organizationIds: organizationIds,
      subject: '',
      content: '',
    },
  });

  const { mutate: sendNewsletter, isPending } = useMutation({
    mutationFn: baseSendNewsletter,
    onSuccess: () => {
      form.reset();
      toast.success(t('common:success.create_newsletter'));
      dropSelectedOrganization?.();
      if (isSheet) sheet.remove();
    },
  });

  const onSubmit = (values: FormValues) => {
    if (!onlineManager.isOnline()) return toast.warning(t('common:action.offline.text'));

    sendNewsletter({
      organizationIds: values.organizationIds,
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
      <form onSubmit={form.handleSubmit(onSubmit)} id="editor-container" className="space-y-6 h-max pl-6">
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

        <FormField
          control={form.control}
          name="content"
          render={({ field: { onChange, value } }) => (
            <FormItem>
              <FormLabel>{t('common:message')}</FormLabel>
              <FormControl>
                <BlockNote onChange={onChange} className="min-h-20" value={value} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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

export default OrganizationsNewsletterForm;
