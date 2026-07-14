import { useMutation } from '@tanstack/react-query';
import { SendIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation for system-level invite, mirrors invite-email-form.
import { systemInvite as baseSystemInvite } from 'sdk';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { SelectRoleRadio } from '~/modules/common/form-fields/select-role-radio';
import { toaster } from '~/modules/common/toaster/toaster';
import type { EnrichedContextEntity } from '~/modules/entities/types';
import { useInviteMemberMutation } from '~/modules/memberships/query-mutations';
import { Badge } from '~/modules/ui/badge';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { Textarea } from '~/modules/ui/textarea';
import { type InviteFormValues, useInviteFormDraft } from '~/modules/user/invite-users';

/** Extract unique, lowercased email addresses from any pasted text (commas, newlines, address-book dumps). */
export const extractEmails = (text: string): string[] => {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(matches.map((email) => email.toLowerCase()))];
};

interface Props {
  contextEntity?: EnrichedContextEntity;
  dialog?: boolean;
  children?: React.ReactNode;
}

/**
 * Bulk variant of the email invite form: emails are extracted from freely pasted text.
 * Operates the same invite flow in the background, only the input differs.
 */
export function InviteBulkEmailForm({ contextEntity, dialog: isDialog, children }: Props) {
  const { t } = useTranslation();

  const [rawText, setRawText] = useState('');
  const form = useInviteFormDraft(contextEntity?.id, contextEntity?.entityType);

  const onTextChange = (text: string) => {
    setRawText(text);
    form.setValue('emails', extractEmails(text), { shouldDirty: true });
  };

  const emails = form.getValues('emails') ?? [];

  const onSuccess = (
    { invitesSentCount, rejectedIds }: { rejectedIds: string[]; invitesSentCount: number },
    submittedEmails: string[],
  ) => {
    form.reset();
    setRawText('');
    if (isDialog) useDialoger.getState().remove();

    if (invitesSentCount > 0) {
      const resource = t(`c:${invitesSentCount === 1 ? 'user' : 'users'}`).toLowerCase();
      toaster(t('c:success.resource_count_invited', { count: invitesSentCount, resource }), 'success');
    }
    if (rejectedIds.length)
      toaster(t('c:still_not_accepted', { count: rejectedIds.length, total: submittedEmails.length }), 'info');
  };

  const { mutate: membershipInvite, isPending } = useInviteMemberMutation();
  const { mutate: systemInvite, isPending: isSystemInvitePending } = useMutation({
    mutationFn: (body: InviteFormValues) => baseSystemInvite({ body }),
    onSuccess: (result, body) => onSuccess(result, body.emails),
  });

  const onSubmit = (body: InviteFormValues) => {
    // With no context, this is a system invite; otherwise it is a membership invite.
    if (!contextEntity) return systemInvite(body);

    const organizationId = contextEntity.organizationId || contextEntity.id;
    const path = { tenantId: contextEntity.tenantId, organizationId: organizationId };
    const query = { entityId: contextEntity.id, entityType: contextEntity.entityType };

    membershipInvite({ body, path, query, contextEntity }, { onSuccess: (result) => onSuccess(result, body.emails) });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormItem name="bulk-emails">
          <FormLabel>{t('app:paste_emails')}</FormLabel>
          <FormDescription>{t('app:paste_emails.text')}</FormDescription>
          <Textarea
            value={rawText}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder={t('app:paste_emails.placeholder')}
            autoResize
            className="min-h-24"
            autoComplete="off"
          />
          <div className="text-muted-foreground text-sm">{t('app:emails_recognized', { count: emails.length })}</div>
          <FormField control={form.control} name="emails" render={() => <FormMessage />} />
        </FormItem>

        {contextEntity && (
          <FormField
            control={form.control}
            name="role"
            render={({ field: { value, onChange } }) => (
              <FormItem className="ml-3 flex-row items-center gap-4">
                <FormLabel>{t('c:role')}</FormLabel>
                <SelectRoleRadio value={value} onValueChange={onChange} entityType={contextEntity.entityType} />
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <SubmitButton disabled={!emails.length} loading={isPending || isSystemInvitePending} className="relative">
            {!!emails.length && (
              <Badge variant="secondary" context="button">
                {emails.length}
              </Badge>
            )}{' '}
            <SendIcon className="mr-2" />
            {t('c:invite')}
          </SubmitButton>
          {children}

          {!children && form.isDirty && (
            <Button
              type="reset"
              variant="secondary"
              onClick={() => {
                form.reset();
                setRawText('');
              }}
            >
              {t('c:cancel')}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
