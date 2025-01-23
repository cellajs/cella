import { zodResolver } from '@hookform/resolvers/zod';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { sendNewsletterBodySchema } from 'backend/modules/organizations/schema';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import BlockNoteContent from '~/modules/common/form-fields/blocknote-content';
import SelectRoles from '~/modules/common/form-fields/select-roles';
import { sheet } from '~/modules/common/sheeter/state';
import { useSendNewsLetterMutation } from '~/modules/organizations/query-mutations';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { useSendNewsLetterToSelfMutation } from '~/modules/users/query-mutations';

import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/app-specific-custom/styles.css';
import '~/modules/common/blocknote/styles.css';

interface NewsletterFormProps {
  organizationIds: string[];
  dropSelectedOrganization?: () => void;
  sheet?: boolean;
}

const formSchema = sendNewsletterBodySchema;

type FormValues = z.infer<typeof formSchema>;

const NewsletterForm: React.FC<NewsletterFormProps> = ({ organizationIds, sheet: isSheet, dropSelectedOrganization }) => {
  const { t } = useTranslation();

  const form = useFormWithDraft<FormValues>('send-org-newsletter', {
    resolver: zodResolver(formSchema),
    defaultValues: {
      organizationIds,
      subject: '',
      roles: ['admin'],
      content: '',
    },
  });

  const { mutate: sendNewsletter, isPending } = useSendNewsLetterMutation();

  const { mutate: sendNewsletterToSelf, isPending: sendToSelfPending } = useSendNewsLetterToSelfMutation();

  const onSubmit = (body: FormValues) => {
    sendNewsletter(body, {
      onSuccess: () => {
        form.reset();
        toast.success(t('common:success.create_newsletter'));
        dropSelectedOrganization?.();
        if (isSheet) sheet.remove('org-newsletter-form');
      },
    });
  };

  const sendTofSelf = () => {
    const body = {
      subject: form.getValues('subject'),
      content: form.getValues('content'),
    };
    sendNewsletterToSelf(body, {
      onSuccess: () => toast.success(t('common:success.test.create_newsletter')),
    });
  };

  const cancel = () => form.reset();

  // default value in blocknote <p class="bn-inline-content"></p> so check if there it's only one
  const isDirty = () => {
    const { dirtyFields } = form.formState;
    const fieldsKeys = Object.keys(dirtyFields);
    if (fieldsKeys.length === 0) return false;
    // select at least one of the roles required
    if (!form.getValues('roles').length) return false;

    if (fieldsKeys.includes('content') && fieldsKeys.length === 1) {
      const content = form.getValues('content');
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      const emptyPElements = Array.from(doc.querySelectorAll('p.bn-inline-content'));

      // Check if any <p> element has non-empty text content
      return emptyPElements.some((el) => el.textContent && el.textContent.trim() !== '');
    }
    return true;
  };

  if (form.loading) return null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} id="newsletter-editor-container" className="space-y-6 pb-8 h-max">
        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('common:subject')}</FormLabel>
              <FormControl>
                <Input {...field} placeholder={t('common:placeholder.subject')} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <BlockNoteContent control={form.control} name="content" required label={t('common:message')} blocknoteId="blocknote-org-newsletter" />

        <FormField
          control={form.control}
          name="roles"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t('common:roles')}
                <span className="ml-1 opacity-50">*</span>
              </FormLabel>
              <FormControl>
                <SelectRoles {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton disabled={!isDirty()} loading={isPending}>
            <Send size={16} className="mr-2" />
            {t('common:send')}
          </SubmitButton>
          <Button type="reset" variant="secondary" className={isDirty() ? '' : 'invisible'} aria-label={t('common:cancel')} onClick={cancel}>
            {t('common:cancel')}
          </Button>

          <div className="grow" />
          <Button type="button" disabled={!isDirty()} aria-label={t('common:send_to_self')} loading={sendToSelfPending} onClick={sendTofSelf}>
            <Send size={16} className="mr-2" />
            {t('common:send_to_self')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default NewsletterForm;
