import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { SelectEmails } from '~/modules/common/form-fields/select-emails';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { Form, FormField, FormItem, FormMessage } from '~/modules/ui/field';
import { InviteFormFooter, type InviteFormProps, useInviteFormDraft, useInviteSubmit } from '~/modules/user/invite-submit';

export function InviteEmailForm({ channel, dialog: isDialog, children }: InviteFormProps) {
  const { t } = useTranslation();

  const { nextStep } = useStepper();

  const form = useInviteFormDraft(channel?.id, channel?.entityType);
  const emails = useWatch({ control: form.control, name: 'emails' });

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
              <SelectEmails placeholder={t('c:add_email')} value={value} onChange={onChange} inputProps={{ autoComplete: 'off' }} />
              <FormMessage />
            </FormItem>
          )}
        />

        <InviteFormFooter form={form} channel={channel} count={emails?.length ?? 0} loading={isPending} onCancel={() => form.reset()}>
          {children}
        </InviteFormFooter>
      </form>
    </Form>
  );
}
