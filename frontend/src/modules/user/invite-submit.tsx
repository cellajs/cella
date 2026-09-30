import { useMutation } from '@tanstack/react-query';
import { SendIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation for system-level invite called from stepper flow.
import { systemInvite as baseSystemInvite } from 'sdk';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { SelectRoleRadio } from '~/modules/common/form-fields/select-role-radio';
import { toaster } from '~/modules/common/toaster/toaster';
import type { EnrichedChannel } from '~/modules/entities/types';
import { useInviteMemberMutation } from '~/modules/memberships/query-mutations';
import { Badge } from '~/modules/ui/badge';
import { Button, SubmitButton } from '~/modules/ui/button';
import { FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import type { InviteFormValues, useInviteFormDraft } from '~/modules/user/invite-users';

/**
 * Sends an invite form as a membership invite to `channel`, or as a system invite without one. A sent invite calls
 * `onSent`, closes the dialog and reports how many addresses were invited and how many were not.
 */
export function useInviteSubmit(
  channel: EnrichedChannel | undefined,
  isDialog: boolean | undefined,
  onSent: () => void,
) {
  const { t } = useTranslation();

  const onSuccess = (
    { invitesSentCount, rejectedIds }: { rejectedIds: string[]; invitesSentCount: number },
    emails: string[],
  ) => {
    onSent();
    if (isDialog) useDialoger.getState().remove();

    if (invitesSentCount > 0) {
      const resource = t('c:user', { count: invitesSentCount }).toLowerCase();
      toaster.success(t('c:success.resource_count_invited', { count: invitesSentCount, resource }));
    }
    if (rejectedIds.length)
      toaster.info(t('c:still_not_accepted', { count: rejectedIds.length, total: emails.length }));
  };

  const { mutate: membershipInvite, isPending } = useInviteMemberMutation();
  const { mutate: systemInvite, isPending: isSystemInvitePending } = useMutation({
    mutationFn: (body: InviteFormValues) => baseSystemInvite({ body }),
    onSuccess: (result, body) => onSuccess(result, body.emails),
  });

  const onSubmit = (body: InviteFormValues) => {
    // With no context, this is a system invite; otherwise it is a membership invite.
    if (!channel) return systemInvite(body);

    const organizationId = channel.organizationId || channel.id;
    const path = { tenantId: channel.tenantId, organizationId: organizationId };
    const query = { entityId: channel.id, entityType: channel.entityType };

    membershipInvite({ body, path, query, channel }, { onSuccess: (result) => onSuccess(result, body.emails) });
  };

  return { onSubmit, isPending: isPending || isSystemInvitePending };
}

interface InviteFormFooterProps {
  form: ReturnType<typeof useInviteFormDraft>;
  channel?: EnrichedChannel;
  count: number;
  isPending: boolean;
  disabled?: boolean;
  onCancel: () => void;
  /** Takes the place of the cancel button, as the onboarding footer does. */
  children?: React.ReactNode;
}

/** Role choice for a channel invite, then the submit button with the address count. */
export function InviteFormFooter({
  form,
  channel,
  count,
  isPending,
  disabled,
  onCancel,
  children,
}: InviteFormFooterProps) {
  const { t } = useTranslation();

  return (
    <>
      {channel && (
        <FormField
          control={form.control}
          name="role"
          render={({ field: { value, onChange } }) => (
            <FormItem className="ml-3 flex-row items-center gap-4">
              <FormLabel>{t('c:role')}</FormLabel>
              <SelectRoleRadio value={value} onValueChange={onChange} entityType={channel.entityType} />
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <SubmitButton disabled={disabled} loading={isPending} className="relative">
          {!!count && (
            <Badge variant="secondary" context="button">
              {count}
            </Badge>
          )}{' '}
          <SendIcon className="mr-2" />
          {t('c:invite')}
        </SubmitButton>
        {children}

        {!children && form.isDirty && (
          <Button type="reset" variant="secondary" onClick={onCancel}>
            {t('c:cancel')}
          </Button>
        )}
      </div>
    </>
  );
}
