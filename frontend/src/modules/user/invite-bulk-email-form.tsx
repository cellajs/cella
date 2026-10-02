import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EnrichedChannel } from '~/modules/entities/types';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { Textarea } from '~/modules/ui/textarea';
import { InviteFormFooter, useInviteSubmit } from '~/modules/user/invite-submit';
import { useInviteFormDraft } from '~/modules/user/invite-users';

/** Extract unique, lowercased email addresses from any pasted text (commas, newlines, address-book dumps). */
export const extractEmails = (text: string): string[] => {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(matches.map((email) => email.toLowerCase()))];
};

interface Props {
  channel?: EnrichedChannel;
  dialog?: boolean;
  children?: React.ReactNode;
}

export function InviteBulkEmailForm({ channel, dialog: isDialog, children }: Props) {
  const { t } = useTranslation();

  const [rawText, setRawText] = useState('');
  const form = useInviteFormDraft(channel?.id, channel?.entityType);

  const clear = () => {
    form.reset();
    setRawText('');
  };

  const { onSubmit, isPending } = useInviteSubmit(channel, isDialog, clear);

  const onTextChange = (text: string) => {
    setRawText(text);
    form.setValue('emails', extractEmails(text), { shouldDirty: true });
  };

  const emails = form.getValues('emails') ?? [];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <FormItem name="bulk-emails">
          <FormLabel help={t('c:paste_emails.text')}>{t('c:paste_emails')}</FormLabel>
          <Textarea
            value={rawText}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder={t('c:paste_emails.placeholder')}
            autoResize
            className="min-h-24"
            autoComplete="off"
          />
          <div className="text-muted-foreground text-sm">{t('c:emails_recognized', { count: emails.length })}</div>
          <FormField control={form.control} name="emails" render={() => <FormMessage />} />
        </FormItem>

        <InviteFormFooter form={form} channel={channel} count={emails.length} isPending={isPending} disabled={!emails.length} onCancel={clear}>
          {children}
        </InviteFormFooter>
      </form>
    </Form>
  );
}
