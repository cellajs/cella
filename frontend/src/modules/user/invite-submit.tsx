import { useMutation } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { SendIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation for system-level invite called from stepper flow.
import { systemInvite as baseSystemInvite, type InviteOutcome } from 'sdk';
import { zMembershipInviteBody } from 'sdk/zod.gen';
import { type ChannelEntityType, hierarchy, isUnpublishedDraft } from 'shared';
import type { z } from 'zod';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { CancelButton } from '~/modules/common/form-fields/cancel-button';
import { FormActions } from '~/modules/common/form-fields/form-actions';
import { SelectRoleRadio } from '~/modules/common/form-fields/select-role-radio';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { NamedText } from '~/modules/common/named-text';
import { toaster } from '~/modules/common/toaster/toaster';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import type { EnrichedChannel } from '~/modules/entities/types';
import { useInviteMemberMutation } from '~/modules/memberships/query-mutations';
import { FormField, FormItem, FormMessage } from '~/modules/ui/field';
import { formResolver } from '~/utils/form-resolver';

type InviteFormValues = z.infer<typeof zMembershipInviteBody>;

/** The target vocabulary's least-privileged role; without an entity type, the organization's. */
const defaultInviteRole = (entityType?: ChannelEntityType): InviteFormValues['role'] =>
  hierarchy.getLeastPrivilegedRole(entityType ?? 'organization') as InviteFormValues['role'];

/** The invite dialog's id, which the form reads its description from and closes by. */
export const inviteDialogId = 'invite-users';

/** The three invite forms of one channel share this form and its draft, so a switch of mode keeps the addresses. */
export function useInviteFormDraft(entityId?: string, entityType?: ChannelEntityType) {
  return useFormWithDraft<InviteFormValues>(`invite-users${entityId ? `-${entityId}` : ''}`, {
    formContainerId: inviteDialogId,
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

/**
 * The one message after a membership invite: what happened in the title ("2 invited, 1 reminded"), then a line for each
 * thing the inviter did not see coming, such as a member left out or a declined invitation sent again.
 */
function useInviteResultMessage() {
  const { t } = useTranslation();
  const day = (date: string) => dayjs.utc(date).local().format('D MMM');

  return (channel: EnrichedChannel, role: string, { outcomes, held }: { outcomes: InviteOutcome[]; held: boolean }) => {
    const of = (outcome: InviteOutcome['outcome']) => outcomes.filter((item) => item.outcome === outcome);
    const [invited, reminded, added, members] = [of('invite'), of('remind'), of('add'), of('member')];
    const declined = reminded.filter(({ declinedAt }) => declinedAt);
    const roles = hierarchy.getRoles(channel.entityType) as readonly string[];

    const title = held
      ? t('c:invite_result_saved', { count: invited.length + reminded.length })
      : [
          invited.length && t('c:invite_result_invited', { count: invited.length }),
          reminded.length && t('c:invite_result_reminded', { count: reminded.length }),
          added.length && t('c:invite_result_added', { count: added.length }),
        ]
          .filter(Boolean)
          .join(', ');

    const [member] = members;
    const [decliner] = declined;
    const [adder] = added;
    const lines = [
      held && t('c:invite_result_held', { name: channel.name }),
      members.length > 1 && t('c:invite_result_member_counted', { count: members.length }),
      member && members.length === 1 && member.role && roles.indexOf(role) < roles.indexOf(member.role)
        ? t('c:invite_result_member_kept', { email: member.email, role: t(`c:${member.role}`) })
        : members.length === 1 && t('c:invite_result_member', { email: member.email }),
      declined.length > 1 && t('c:invite_result_declined_counted', { count: declined.length }),
      decliner?.declinedAt && declined.length === 1 && t('c:invite_result_declined', { email: decliner.email, date: day(decliner.declinedAt) }),
      added.length > 1 && t('c:invite_result_added_directly_counted', { count: added.length }),
      adder && added.length === 1 && t('c:invite_result_added_directly', { email: adder.email }),
    ].filter(Boolean);

    toaster.success(title, lines.length ? { description: lines.join(' ') } : undefined);
  };
}

/** Sends the form as a membership invite to `channel`, or as a system invite without one; a sent invite runs `onSent` and says what happened. */
export function useInviteSubmit(channel: EnrichedChannel | undefined, isDialog: boolean | undefined, onSent: () => void) {
  const { t } = useTranslation();
  const showResult = useInviteResultMessage();

  const close = () => {
    onSent();
    if (isDialog) dialoger.getState().remove(inviteDialogId);
  };

  const { mutate: membershipInvite, isPending } = useInviteMemberMutation();
  const { mutate: systemInvite, isPending: isSystemInvitePending } = useMutation({
    mutationFn: (body: InviteFormValues) => baseSystemInvite({ body }),
    onSuccess: ({ invitesSentCount, rejectedIds }, { emails }) => {
      close();
      if (invitesSentCount > 0) {
        const resource = t('c:user', { count: invitesSentCount });
        toaster.success(t('c:success.invite_resource_counted', { count: invitesSentCount, resource }));
      }
      if (rejectedIds.length) toaster.info(t('c:still_not_accepted', { count: rejectedIds.length, total: emails.length }));
    },
  });

  const onSubmit = (body: InviteFormValues) => {
    if (!channel) return systemInvite(body);

    const path = { tenantId: channel.tenantId, organizationId: channelOrganizationId(channel) };
    const query = { entityId: channel.id, entityType: channel.entityType };

    membershipInvite(
      { body, path, query, channel },
      {
        onSuccess: (result) => {
          close();
          showResult(channel, body.role, result);
        },
      },
    );
  };

  return { onSubmit, isPending: isPending || isSystemInvitePending };
}

interface InviteFormFooterProps extends Omit<InviteFormProps, 'dialog'> {
  form: ReturnType<typeof useInviteFormDraft>;
  /** What the submit does: new invitations, invitations sent again, and members it leaves out. */
  counts: { invite: number; remind: number; member: number };
  loading: boolean;
  onCancel: () => void;
}

/** Role choice for a channel invite, with when its email goes out in a draft channel, then the submit button with the address count. */
export function InviteFormFooter({ form, channel, counts, loading, onCancel, children }: InviteFormFooterProps) {
  const { t } = useTranslation();

  const { invite, remind, member } = counts;
  const label =
    invite && remind
      ? t('c:invite_and_remind', { invite, remind })
      : remind
        ? t('c:remind_count', { count: remind })
        : invite
          ? t('c:invite_count', { count: invite })
          : member
            ? t('c:nothing_to_send')
            : t('c:invite');

  return (
    <>
      {channel && (
        <FormField
          control={form.control}
          name="role"
          render={({ field: { value, onChange } }) => (
            <FormItem className="ml-3 flex-row flex-wrap items-center gap-x-4 gap-y-2">
              <SelectRoleRadio value={value} onChange={onChange} entityType={channel.entityType} label={t('c:role')} />
              {isUnpublishedDraft(channel) && (
                <p className="basis-full text-muted-foreground text-sm">
                  <NamedText
                    i18nKey={hierarchy.getPrepareRoles(channel.entityType).includes(value) ? 'c:invite_prepare.text' : 'c:invite_held.text'}
                    name={channel.name}
                    values={{ roles: t(`c:${value}`, { count: 2 }) }}
                  />
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormActions>
        <SubmitButton disabled={!invite && !remind} loading={loading}>
          <SendIcon />
          {label}
        </SubmitButton>
        {!children && <CancelButton dirty={form.isDirty} onClick={onCancel} />}
        {children}
      </FormActions>
    </>
  );
}
