import { SendIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import SelectRoleRadio from '~/modules/common/form-fields/select-role-radio';
import { toaster } from '~/modules/common/toaster/service';
import type { EntityData } from '~/modules/entities/types';
import { useInviteMemberMutation } from '~/modules/memberships/query-mutations';
import { Badge } from '~/modules/ui/badge';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { type InviteFormValues, useInviteFormDraft } from '~/modules/users/invite-users';
import { UserCombobox } from '~/modules/users/user-combobox';

interface Props {
  entity?: EntityData;
  dialog?: boolean;
}

/**
 * Invite members by searching for users which are already in the system
 */
const InviteSearchForm = ({ entity, dialog: isDialog }: Props) => {
  const { t } = useTranslation();
  if (!entity) return null;

  const form = useInviteFormDraft(entity?.id);
  const { mutate: invite, isPending } = useInviteMemberMutation();

  const onSubmit = (values: InviteFormValues) => {
    invite(
      { ...values, entity },
      {
        onSuccess: ({ invitesSentCount, rejectedItems }, { emails }) => {
          form.reset(undefined, { keepDirtyValues: true });
          if (invitesSentCount > 0) {
            const resource = t(`common:${invitesSentCount === 1 ? 'user' : 'users'}`).toLowerCase();
            toaster(t('common:success.resource_count_invited', { count: invitesSentCount, resource }), 'success');
          }
          if (rejectedItems.length) toaster(t('common:still_not_accepted', { count: rejectedItems.length, total: emails.length }), 'info');

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
              <FormControl>
                <UserCombobox value={value} onChange={onChange} entity={entity} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field: { value, onChange } }) => (
            <FormItem className="flex-row gap-4 items-center">
              <FormLabel>{t('common:role')}:</FormLabel>
              <FormControl>
                <SelectRoleRadio value={value} onChange={onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton loading={isPending} className="relative">
            {!!form.getValues('emails')?.length && (
              <Badge variant="secondary" context="button">
                {form.getValues('emails')?.length}
              </Badge>
            )}
            <SendIcon size={16} className="mr-2" />
            {t('common:invite')}
          </SubmitButton>
          {form.isDirty && (
            <Button type="reset" variant="secondary" onClick={() => form.reset()}>
              {t('common:cancel')}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
};

export default InviteSearchForm;
