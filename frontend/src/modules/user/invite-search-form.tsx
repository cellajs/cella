import { useWatch } from 'react-hook-form';
import { Form, FormField, FormItem, FormMessage } from '~/modules/ui/field';
import { InviteFormFooter, type InviteFormProps, useInviteFormDraft, useInviteSubmit } from '~/modules/user/invite-submit';
import { useInviteCheck } from '~/modules/user/use-invite-check';
import { UserCombobox } from '~/modules/user/user-combobox';

export function InviteSearchForm({ channel, dialog: isDialog, children }: InviteFormProps) {
  const form = useInviteFormDraft(channel?.id, channel?.entityType);
  const emails = useWatch({ control: form.control, name: 'emails' }) ?? [];
  const check = useInviteCheck(channel, emails);

  const { onSubmit, isPending } = useInviteSubmit(channel, isDialog, () => form.reset(undefined, { keepDirtyValues: true }));

  if (!channel || form.loading) return null;

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <FormField
          control={form.control}
          name="emails"
          render={({ field: { onChange, value } }) => (
            <FormItem>
              <UserCombobox value={value} onChange={onChange} channel={channel} />
              <FormMessage />
            </FormItem>
          )}
        />
        <InviteFormFooter form={form} channel={channel} counts={check.counts} loading={isPending} onCancel={() => form.reset()}>
          {children}
        </InviteFormFooter>
      </form>
    </Form>
  );
}
