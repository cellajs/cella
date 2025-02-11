import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { Info, Send } from 'lucide-react';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import BlockNoteContent from '~/modules/common/form-fields/blocknote-content';
import SelectRoles from '~/modules/common/form-fields/select-roles';
import { sheet } from '~/modules/common/sheeter/state';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { sendNewsletterBodySchema } from '#/modules/organizations/schema';

import '@blocknote/shadcn/style.css';
import type { CheckedState } from '@radix-ui/react-checkbox';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { MainAlert } from '~/modules/common/alerter';
import '~/modules/common/blocknote/app-specific-custom/styles.css';
import '~/modules/common/blocknote/styles.css';
import InputFormField from '~/modules/common/form-fields/input';
import { createToast } from '~/modules/common/toaster';
import { sendNewsletter } from '~/modules/organizations/api';
import { Checkbox } from '~/modules/ui/checkbox';

interface NewsletterFormProps {
  organizationIds: string[];
}

const formSchema = sendNewsletterBodySchema;

type FormValues = z.infer<typeof formSchema>;

const NewsletterForm = ({ organizationIds }: NewsletterFormProps) => {
  const { t } = useTranslation();

  const [testOnly, setTestOnly] = useState<CheckedState>(false);

  // Create form
  const form = useFormWithDraft<FormValues>('newsletter', {
    resolver: zodResolver(formSchema),
    defaultValues: {
      organizationIds,
      subject: '',
      roles: [],
      content: '',
    },
  });

  // Send newsletter
  const { mutate: _sendNewsletter, isPending } = useMutation({
    mutationFn: sendNewsletter,
    onSuccess: () => {
      if (testOnly) return createToast(t('common:success.test_email'), 'success');
      form.reset();
      createToast(t('common:success.create_newsletter'), 'success');
      sheet.remove('newsletter-sheet');
    },
  });

  const onSubmit = (body: FormValues) => {
    _sendNewsletter({ body, toSelf: !!testOnly });
  };

  const cancel = () => form.reset();

  if (form.loading) return null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} id="newsletter-form" className="space-y-6 pb-8 h-max">
        <InputFormField control={form.control} name="subject" placeholder={t('common:placeholder.subject')} label={t('common:subject')} required />

        <BlockNoteContent control={form.control} name="content" required label={t('common:message')} blocknoteId="blocknote-newsletter" />

        {/* TODO so many aria-required? */}
        <FormField
          control={form.control}
          name="roles"
          render={({ field }) => (
            <FormItem aria-required="true">
              <FormLabel aria-required="true">{t('common:roles')}</FormLabel>
              <FormControl aria-required="true">
                <SelectRoles {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {testOnly && (
          <MainAlert id="test-email" variant="plain" Icon={Info}>
            {t('common:test_email.text')}
          </MainAlert>
        )}

        <div className="flex flex-col sm:flex-row gap-2 items-center">
          <SubmitButton loading={isPending}>
            <Send size={16} className="mr-2" />
            {testOnly ? t('common:send_test_email') : t('common:send')}
          </SubmitButton>
          <Button type="reset" variant="secondary" aria-label={t('common:cancel')} onClick={cancel}>
            {t('common:cancel')}
          </Button>

          <Checkbox id="testOnly" checked={testOnly} onCheckedChange={(value) => setTestOnly(value)} className="w-4 h-4 ml-4" />
          <label htmlFor="testOnly" className="items-center text-sm">
            {t('common:test_email')}
          </label>
        </div>
      </form>
    </Form>
  );
};

export default NewsletterForm;
