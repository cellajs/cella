import { useMutation } from '@tanstack/react-query';
import { SendIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation for system-level invite called from stepper flow.
import { systemInvite as baseSystemInvite } from 'sdk';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { SelectEmails } from '~/modules/common/form-fields/select-emails';
import { SelectRoleRadio } from '~/modules/common/form-fields/select-role-radio';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { toaster } from '~/modules/common/toaster/toaster';
import type { EnrichedContextEntity } from '~/modules/entities/types';
import { useInviteMemberMutation } from '~/modules/memberships/query-mutations';
import type { InviteMember } from '~/modules/memberships/types';
import { Badge } from '~/modules/ui/badge';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { type InviteFormValues, useInviteFormDraft } from '~/modules/user/invite-users';

interface Props {
  contextEntity?: EnrichedContextEntity;
  dialog?: boolean;
  children?: React.ReactNode;
}

/**
 * Form for inviting users by email.
 */
export function InviteEmailForm({ contextEntity, dialog: isDialog, children }: Props) {
  const { t } = useTranslation();

  const { nextStep } = useStepper();

  const form = useInviteFormDraft(contextEntity?.id);

  const onSuccess = (
    { invitesSentCount, rejectedIds }: { rejectedIds: string[]; invitesSentCount: number },
    variables: InviteFormValues | InviteMember,
  ) => {
    const emails = 'emails' in variables ? variables.emails : variables.body.emails;
    form.reset(undefined, { keepDirtyValues: true });
    if (isDialog) useDialoger.getState().remove();

    if (invitesSentCount > 0) {
      const resource = t(`c:${invitesSentCount === 1 ? 'user' : 'users'}`).toLowerCase();
      toaster(t('c:success.resource_count_invited', { count: invitesSentCount, resource }), 'success');
    }
    if (rejectedIds.length)
      toaster(t('c:still_not_accepted', { count: rejectedIds.length, total: emails.length }), 'info');

    // Onboarding advances through stepper state instead of the optional callback.
    nextStep?.();
  };

  const { mutate: membershipInvite, isPending } = useInviteMemberMutation();
  const { mutate: systemInvite, isPending: isSystemInvitePending } = useMutation({
    mutationFn: (body: InviteFormValues) => baseSystemInvite({ body }),
    onSuccess,
  });

  const onSubmit = (body: InviteFormValues) => {
    // With no context, this is a system invite; otherwise it is a membership invite.
    if (!contextEntity) return systemInvite(body);

    const organizationId = contextEntity.organizationId || contextEntity.id;
    const path = { tenantId: contextEntity.tenantId, organizationId: organizationId };
    const query = { entityId: contextEntity.id, entityType: contextEntity.entityType };

    membershipInvite({ body, path, query, contextEntity }, { onSuccess });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="emails"
          render={({ field: { onChange, value } }) => (
            <FormItem>
              <SelectEmails
                placeholder={t('c:add_email')}
                emails={value}
                onValueChange={onChange}
                inputProps={{ autoComplete: 'off' }}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        {contextEntity && (
          <FormField
            control={form.control}
            name="role"
            render={({ field: { value, onChange } }) => (
              <FormItem className="ml-3 flex-row items-center gap-4">
                <FormLabel>{t('c:role')}</FormLabel>
                <SelectRoleRadio value={value} onValueChange={onChange} />
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <SubmitButton loading={isPending || isSystemInvitePending} className="relative">
            {!!form.getValues('emails')?.length && (
              <Badge variant="secondary" context="button">
                {form.getValues('emails')?.length}
              </Badge>
            )}{' '}
            <SendIcon size={16} className="mr-2" />
            {t('c:invite')}
          </SubmitButton>
          {children}

          {!children && form.isDirty && (
            <Button type="reset" variant="secondary" onClick={() => form.reset()}>
              {t('c:cancel')}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
