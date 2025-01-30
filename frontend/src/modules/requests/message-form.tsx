import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';

import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import BlockNoteContent from '~/modules/common/form-fields/blocknote-content';
import { sheet } from '~/modules/common/sheeter/state';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { requestMessageBodySchema } from '#/modules/requests/schema';

import '@blocknote/shadcn/style.css';
import { useMutation } from '@tanstack/react-query';
import '~/modules/common/blocknote/app-specific-custom/styles.css';
import '~/modules/common/blocknote/styles.css';
import { sendRequestMessage } from './api';

interface MessageFormProps {
  emails: string[];
}

const formSchema = requestMessageBodySchema;

type FormValues = z.infer<typeof formSchema>;

const MessageForm = ({ emails }: MessageFormProps) => {
  const { t } = useTranslation();

  const form = useFormWithDraft<FormValues>('request-message', {
    resolver: zodResolver(formSchema),
    defaultValues: {
      emails,
      subject: '',
      content: '',
    },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: sendRequestMessage,
    onSuccess: () => {
      form.reset();
      toast.success(t('common:success.request_feedback'));
      sheet.remove('feedback-letter-form');
    },
  });

  const onSubmit = (body: FormValues) => {
    mutate(body);
  };

  const cancel = () => form.reset();

  // default value in blocknote <p class="bn-inline-content"></p> so check if it's only one
  // TODO move this to blocknote helper?
  const isDirty = () => {
    const { dirtyFields } = form.formState;
    const fieldsKeys = Object.keys(dirtyFields);
    if (fieldsKeys.length === 0) return false;
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
      <form onSubmit={form.handleSubmit(onSubmit)} id="message-form" className="space-y-6 pb-8 h-max">
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

        <BlockNoteContent control={form.control} name="content" required label={t('common:message')} blocknoteId="blocknote-feedback-letter" />

        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton disabled={!isDirty()} loading={isPending}>
            <Send size={16} className="mr-2" />
            {t('common:send')}
          </SubmitButton>
          <Button type="reset" variant="secondary" className={isDirty() ? '' : 'invisible'} aria-label="Cancel" onClick={cancel}>
            {t('common:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default MessageForm;
