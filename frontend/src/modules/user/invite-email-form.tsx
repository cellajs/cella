import { SendIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { systemInvite as baseSystemInvite } from '~/api.gen';
import { useMutation } from '~/hooks/use-mutations';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { SelectEmails } from '~/modules/common/form-fields/select-emails';
import SelectRoleRadio from '~/modules/common/form-fields/select-role-radio';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { toaster } from '~/modules/common/toaster/service';
import type { ContextEntityData } from '~/modules/entities/types';
import { useInviteMemberMutation } from '~/modules/memberships/query-mutations';
import type { InviteMember } from '~/modules/memberships/types';
import { Badge } from '~/modules/ui/badge';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { type InviteFormValues, useInviteFormDraft } from '~/modules/user/invite-users';

interface Props {
  entity?: ContextEntityData;
  dialog?: boolean;
  children?: React.ReactNode;
}

/**
 * Form for inviting users by email.
 */
function InviteEmailForm({ entity, dialog: isDialog, children }: Props) {
  const { t } = useTranslation();

  const { nextStep } = useStepper();

  const form = useInviteFormDraft(entity?.id);

  const onSuccess = (
    { invitesSentCount, rejectedItemIds }: { rejectedItemIds: string[]; invitesSentCount: number },
    { emails }: { emails: string[] },
  ) => {
    form.reset(undefined, { keepDirtyValues: true });
    if (isDialog) useDialoger.getState().remove();

    if (invitesSentCount > 0) {
      const resource = t(`common:${invitesSentCount === 1 ? 'user' : 'users'}`).toLowerCase();
      toaster(t('common:success.resource_count_invited', { count: invitesSentCount, resource }), 'success');
    }
    if (rejectedItemIds.length)
      toaster(t('common:still_not_accepted', { count: rejectedItemIds.length, total: emails.length }), 'info');

    // Since this form is also used in onboarding, we need to call the next step
    // This should ideally be done through the callback, but we need to refactor stepper
    nextStep?.();
  };

  const { mutate: membershipInvite, isPending } = useInviteMemberMutation();
  const { mutate: systemInvite, isPending: isSystemInvitePending } = useMutation({
    mutationFn: (body: InviteFormValues) => baseSystemInvite({ body }),
    onSuccess,
  });

  const onSubmit = (values: InviteFormValues) => {
    entity ? membershipInvite({ ...values, entity } as InviteMember, { onSuccess }) : systemInvite(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="emails"
          render={({ field: { onChange, value } }) => (
            <FormItem>
              <FormControl>
                <SelectEmails
                  placeholder={t('common:add_email')}
                  emails={value}
                  onChange={onChange}
                  inputProps={{ autoComplete: 'off' }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {entity && (
          <FormField
            control={form.control}
            name="role"
            render={({ field: { value, onChange } }) => (
              <FormItem className="flex-row ml-3 gap-4 items-center">
                <FormLabel>{t('common:role')}</FormLabel>
                <FormControl>
                  <SelectRoleRadio value={value} onChange={onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton loading={isPending || isSystemInvitePending} className="relative">
            {!!form.getValues('emails')?.length && (
              <Badge variant="secondary" context="button">
                {form.getValues('emails')?.length}
              </Badge>
            )}{' '}
            <SendIcon size={16} className="mr-2" />
            {t('common:invite')}
          </SubmitButton>
          {children}

          {!children && form.isDirty && (
            <Button type="reset" variant="secondary" onClick={() => form.reset()}>
              {t('common:cancel')}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}

export default InviteEmailForm;
