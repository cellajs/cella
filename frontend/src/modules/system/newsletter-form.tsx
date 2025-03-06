import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import type { CheckedState } from '@radix-ui/react-checkbox';
import { useMutation } from '@tanstack/react-query';
import { Info, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { AlertWrap } from '~/modules/common/alert-wrap';
import BlockNoteContent from '~/modules/common/form-fields/blocknote-content';
import InputFormField from '~/modules/common/form-fields/input';
import SelectRoles from '~/modules/common/form-fields/select-roles';
import { sheet } from '~/modules/common/sheeter/state';
import { toaster } from '~/modules/common/toaster';
import { sendNewsletter } from '~/modules/system/api';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Checkbox } from '~/modules/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { sendNewsletterBodySchema } from '#/modules/system/schema';

import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/app-specific-custom/styles.css';
import '~/modules/common/blocknote/styles.css';
interface NewsletterFormProps {
  organizationIds: string[];
}

const formSchema = sendNewsletterBodySchema;

type FormValues = z.infer<typeof formSchema>;

const NewsletterForm = ({ organizationIds }: NewsletterFormProps) => {
  const { t } = useTranslation();

  const [testOnly, setTestOnly] = useState<CheckedState>(false);

  const formOptions: UseFormProps<FormValues> = useMemo(
    () => ({
      resolver: zodResolver(formSchema),
      defaultValues: { organizationIds, subject: '', roles: [], content: '' },
    }),
    [],
  );

  // Create form
  const form = useFormWithDraft<FormValues>('newsletter', { formOptions });

  // Send newsletter
  const { mutate: _sendNewsletter, isPending } = useMutation({
    mutationFn: sendNewsletter,
    onSuccess: () => {
      if (testOnly) return toaster(t('common:success.test_email'), 'success');
      form.reset();
      toaster(t('common:success.create_newsletter'), 'success');
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

        <FormField
          control={form.control}
          name="roles"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('common:roles')}</FormLabel>
              <FormControl>
                <SelectRoles {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {testOnly && (
          <AlertWrap id="test-email" variant="plain" Icon={Info}>
            {t('common:test_email.text')}
          </AlertWrap>
        )}

        <div className="flex max-sm:flex-col gap-2 items-center">
          <SubmitButton loading={isPending} className="max-sm:w-full">
            <Send size={16} className="mr-2" />
            {testOnly ? t('common:send_test_email') : t('common:send')}
          </SubmitButton>
          <Button type="reset" variant="secondary" className="max-sm:w-full" aria-label={t('common:cancel')} onClick={cancel}>
            {t('common:cancel')}
          </Button>
          DJUHYKI7='P6U'
          <div className="max-sm:mt-2 flex gap-2 items-center">
            <Checkbox id="testOnly" checked={testOnly} onCheckedChange={(value) => setTestOnly(value)} className="w-4 h-4 ml-4" />
            <label htmlFor="testOnly" className="items-center text-sm">
              {t('common:test_email')}
            </label>
          </div>
        </div>
      </form>
    </Form>
  );
};

export default NewsletterForm;
