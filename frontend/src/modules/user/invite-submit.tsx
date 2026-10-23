import { useMutation } from '@tanstack/react-query';
import { SendIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation for system-level invite called from stepper flow.
import { systemInvite as baseSystemInvite } from 'sdk';
import { zMembershipInviteBody } from 'sdk/zod.gen';
import { type ChannelEntityType, hierarchy } from 'shared';
import type z from 'zod';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { CancelButton } from '~/modules/common/form-fields/cancel-button';
import { SelectRoleRadio } from '~/modules/common/form-fields/select-role-radio';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { toaster } from '~/modules/common/toaster/toaster';
import type { EnrichedChannel } from '~/modules/entities/types';
import { useInviteMemberMutation } from '~/modules/memberships/query-mutations';
import { Badge } from '~/modules/ui/badge';
import { FormField, FormItem, FormMessage } from '~/modules/ui/field';
import { formResolver } from '~/utils/form-resolver';

type InviteFormValues = z.infer<typeof zMembershipInviteBody>;

/** The target vocabulary's least-privileged role; without an entity type, the organization's. */
const defaultInviteRole = (entityType?: ChannelEntityType): InviteFormValues['role'] =>
  hierarchy.getLeastPrivilegedRole(entityType ?? 'organization') as InviteFormValues['role'];

/** The three invite forms of one channel share this form and its draft, so a switch of mode keeps the addresses. */
export function useInviteFormDraft(entityId?: string, entityType?: ChannelEntityType) {
  return useFormWithDraft<InviteFormValues>(`invite-users${entityId ? `-${entityId}` : ''}`, {
    formContainerId: 'invite-users',
    formOptions: {
      resolver: formResolver(zMembershipInviteBody),
      defaultValues: { emails: [], role: defaultInviteRole(entityType) },
    },
  });
}

export interface InviteFormProps {
  /** Without one the form sends a system invite. */
  channel?: EnrichedChannel;
  /** Rendered in the `invite-users` dialog, which a sent invite closes. */
  dialog?: boolean;
  /** Takes the place of the cancel button, as the onboarding footer does. */
  children?: ReactNode;
}

/** Sends the form as a membership invite to `channel`, or as a system invite without one; a sent invite runs `onSent` and toasts the counts. */
export function useInviteSubmit(channel: EnrichedChannel | undefined, isDialog: boolean | undefined, onSent: () => void) {
  const { t } = useTranslation();

  const handleSuccess = ({ invitesSentCount, rejectedIds }: { rejectedIds: string[]; invitesSentCount: number }, emails: string[]) => {
    onSent();
    if (isDialog) dialoger.getState().remove('invite-users');

    if (invitesSentCount > 0) {
      const resource = t('c:user', { count: invitesSentCount }).toLowerCase();
      toaster.success(t('c:success.resource_count_invited', { count: invitesSentCount, resource }));
    }
    if (rejectedIds.length) toaster.info(t('c:still_not_accepted', { count: rejectedIds.length, total: emails.length }));
  };

  const { mutate: membershipInvite, isPending } = useInviteMemberMutation();
  const { mutate: systemInvite, isPending: isSystemInvitePending } = useMutation({
    mutationFn: (body: InviteFormValues) => baseSystemInvite({ body }),
    onSuccess: (result, body) => handleSuccess(result, body.emails),
  });

  const onSubmit = (body: InviteFormValues) => {
    if (!channel) return systemInvite(body);

    const organizationId = channel.organizationId || channel.id;
    const path = { tenantId: channel.tenantId, organizationId };
    const query = { entityId: channel.id, entityType: channel.entityType };

    membershipInvite({ body, path, query, channel }, { onSuccess: (result) => handleSuccess(result, body.emails) });
  };

  return { onSubmit, isPending: isPending || isSystemInvitePending };
}

interface InviteFormFooterProps extends Omit<InviteFormProps, 'dialog'> {
  form: ReturnType<typeof useInviteFormDraft>;
  count: number;
  loading: boolean;
  onCancel: () => void;
}

/** Role choice for a channel invite, then the submit button with the address count. */
export function InviteFormFooter({ form, channel, count, loading, onCancel, children }: InviteFormFooterProps) {
  const { t } = useTranslation();

  return (
    <>
      {channel && (
        <FormField
          control={form.control}
          name="role"
          render={({ field: { value, onChange } }) => (
            <FormItem className="ml-3 flex-row items-center gap-4">
              <SelectRoleRadio value={value} onChange={onChange} entityType={channel.entityType} label={t('c:role')} />
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <SubmitButton disabled={!count} loading={loading} className="relative">
          {!!count && (
            <Badge variant="secondary" context="button">
              {count}
            </Badge>
          )}
          <SendIcon />
          {t('c:invite')}
        </SubmitButton>
        {!children && <CancelButton dirty={form.isDirty} onClick={onCancel} />}
        {children}
      </div>
    </>
  );
}
