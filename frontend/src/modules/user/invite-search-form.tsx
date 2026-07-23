import { SendIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { SelectRoleRadio } from '~/modules/common/form-fields/select-role-radio';
import { toaster } from '~/modules/common/toaster/toaster';
import type { EnrichedChannel } from '~/modules/entities/types';
import { useInviteMemberMutation } from '~/modules/memberships/query-mutations';
import { Badge } from '~/modules/ui/badge';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { type InviteFormValues, useInviteFormDraft } from '~/modules/user/invite-users';
import { UserCombobox } from '~/modules/user/user-combobox';

interface Props {
  channel?: EnrichedChannel;
  dialog?: boolean;
}

/**
 * Invite members by searching for users which are already in the system
 */
export function InviteSearchForm({ channel, dialog: isDialog }: Props) {
  const { t } = useTranslation();

  const form = useInviteFormDraft(channel?.id);
  const { mutate: invite, isPending } = useInviteMemberMutation();

  if (!channel) return null;

  const onSubmit = (values: InviteFormValues) => {
    invite(
      {
        body: values,
        path: { tenantId: channel.tenantId, organizationId: channel.organizationId || channel.id },
        query: { entityId: channel.id, entityType: channel.entityType },
        channel,
      },
      {
        onSuccess: ({ invitesSentCount, rejectedIds }, { body: { emails } }) => {
          form.reset(undefined, { keepDirtyValues: true });
          if (invitesSentCount > 0) {
            const resource = t(`c:${invitesSentCount === 1 ? 'user' : 'users'}`).toLowerCase();
            toaster.success(t('c:success.resource_count_invited', { count: invitesSentCount, resource }));
          }
          if (rejectedIds.length)
            toaster.info(t('c:still_not_accepted', { count: rejectedIds.length, total: emails.length }));

          if (isDialog) useDialoger.getState().remove();
        },
      },
    );
  };

  if (form.loading) return null;
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="emails"
          render={({ field: { onChange, value } }) => (
            <FormItem>
              <UserCombobox value={value} onValueChange={onChange} channel={channel} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field: { value, onChange } }) => (
            <FormItem className="flex-row items-center gap-4">
              <FormLabel>{t('c:role')}:</FormLabel>
              <SelectRoleRadio value={value} onValueChange={onChange} />
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <SubmitButton loading={isPending} className="relative">
            {!!form.getValues('emails')?.length && (
              <Badge variant="secondary" context="button">
                {form.getValues('emails')?.length}
              </Badge>
            )}
            <SendIcon className="mr-2" />
            {t('c:invite')}
          </SubmitButton>
          {form.isDirty && (
            <Button type="reset" variant="secondary" onClick={() => form.reset()}>
              {t('c:cancel')}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
