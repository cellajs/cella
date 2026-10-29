import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isInviteEmail } from '~/modules/common/form-fields/select-emails';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { Textarea } from '~/modules/ui/textarea';
import { InviteGroups } from '~/modules/user/invite-groups';
import { InviteFormFooter, type InviteFormProps, useInviteFormDraft, useInviteSubmit } from '~/modules/user/invite-submit';
import { useInviteCheck } from '~/modules/user/use-invite-check';

/** Unique, lowercased addresses an invite accepts, from any pasted text (commas, newlines, address-book dumps). */
const extractEmails = (text: string): string[] => {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(matches.map((email) => email.toLowerCase()))].filter(isInviteEmail);
};

export function InviteBulkEmailForm({ channel, dialog: isDialog, children }: InviteFormProps) {
  const { t } = useTranslation();

  // Null until the user types: until then the box shows the addresses the shared draft restored, such as the email form's chips.
  const [rawText, setRawText] = useState<string | null>(null);
  const form = useInviteFormDraft(channel?.id, channel?.entityType);

  const clear = () => {
    form.reset();
    setRawText(null);
  };

  const { onSubmit, isPending } = useInviteSubmit(channel, isDialog, clear);

  const handleTextChange = (text: string) => {
    setRawText(text);
    form.setValue('emails', extractEmails(text), { shouldDirty: true });
  };

  const emails = form.getValues('emails') ?? [];
  const check = useInviteCheck(channel, emails);

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <FormItem name="bulk-emails">
          <FormLabel help={t('c:paste_emails.text')}>{t('c:paste_emails')}</FormLabel>
          <FormControl>
            <Textarea
              value={rawText ?? emails.join('\n')}
              onChange={(event) => handleTextChange(event.target.value)}
              placeholder={t('c:placeholder.paste_emails')}
              autoResize
              className="min-h-24"
              autoComplete="off"
            />
          </FormControl>
          <div className="text-muted-foreground text-sm">{t('c:emails_recognized', { count: emails.length })}</div>
          <FormField control={form.control} name="emails" render={() => <FormMessage />} />
        </FormItem>
        <InviteGroups emails={emails} check={check} />

        <InviteFormFooter form={form} channel={channel} counts={check.counts} loading={isPending} onCancel={clear}>
          {children}
        </InviteFormFooter>
      </form>
    </Form>
  );
}
