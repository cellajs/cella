import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { SelectEmails } from '~/modules/common/form-fields/select-emails';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { Form, FormField, FormItem, FormMessage } from '~/modules/ui/field';
import { InviteGroups } from '~/modules/user/invite-groups';
import { InviteFormFooter, type InviteFormProps, useInviteFormDraft, useInviteSubmit } from '~/modules/user/invite-submit';
import { inviteNote, useInviteCheck } from '~/modules/user/use-invite-check';

// Past this many addresses the chips are too many to read, so groups follow them
const groupFrom = 9;

export function InviteEmailForm({ channel, dialog: isDialog, children }: InviteFormProps) {
  const { t } = useTranslation();

  const { nextStep } = useStepper();

  const form = useInviteFormDraft(channel?.id, channel?.entityType);
  const emails = useWatch({ control: form.control, name: 'emails' }) ?? [];
  const check = useInviteCheck(channel, emails);

  const { onSubmit, isPending } = useInviteSubmit(channel, isDialog, () => {
    form.reset(undefined, { keepDirtyValues: true });
    nextStep();
  });

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <FormField
          control={form.control}
          name="emails"
          render={({ field: { onChange, value } }) => (
            <FormItem>
              <SelectEmails
                placeholder={t('c:add_email')}
                value={value}
                onChange={onChange}
                inputProps={{ id: 'invite-emails', autoComplete: 'off' }}
                chipState={(email) => ({ state: check.stateOf(email), note: inviteNote(check.outcomeOf(email), t) })}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        {emails.length >= groupFrom && <InviteGroups emails={emails} check={check} />}

        <InviteFormFooter form={form} channel={channel} counts={check.counts} loading={isPending} onCancel={() => form.reset()}>
          {children}
        </InviteFormFooter>
      </form>
    </Form>
  );
}
