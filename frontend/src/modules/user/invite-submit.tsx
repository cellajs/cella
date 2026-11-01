import { useMutation } from '@tanstack/react-query';
import { ClockIcon, SendIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation for system-level invite called from stepper flow.
import { systemInvite as baseSystemInvite } from 'sdk';
import { zMembershipInviteBody } from 'sdk/zod.gen';
import { type ChannelEntityType, hierarchy, isUnpublishedDraft } from 'shared';
import { z } from 'zod';
import type { TKey } from '~/lib/i18n-locales';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { CancelButton } from '~/modules/common/form-fields/cancel-button';
import { FormActions } from '~/modules/common/form-fields/form-actions';
import { SelectRoleRadio } from '~/modules/common/form-fields/select-role-radio';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { NamedText } from '~/modules/common/named-text';
import { toaster } from '~/modules/common/toaster/toaster';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import type { EnrichedChannel } from '~/modules/entities/types';
import { sendInBatches } from '~/modules/memberships/query';
import { useInviteMemberMutation } from '~/modules/memberships/query-mutations';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { FormField, FormItem } from '~/modules/ui/field';
import { type InviteResultData, inviteResultNeedsScreen, inviteResultTitle } from '~/modules/user/invite-result';
import type { InviteCheck } from '~/modules/user/use-invite-check';
import { formResolver } from '~/utils/form-resolver';

/** The invite dialog's id, which the form marks as unsaved and closes by. */
export const inviteDialogId = 'invite-users';

/** The invite body with no limit on addresses, since they go out in batches, plus the text a list held that is no address. */
const inviteFormSchema = zMembershipInviteBody.extend({
  emails: z.array(zMembershipInviteBody.shape.emails.element).min(1),
  unparsed: z.array(z.string()),
});

type InviteFormValues = z.infer<typeof inviteFormSchema>;

/** The target vocabulary's least-privileged role; without an entity type, the organization's. */
const defaultInviteRole = (entityType?: ChannelEntityType): InviteFormValues['role'] =>
  hierarchy.getLeastPrivilegedRole(entityType ?? 'organization') as InviteFormValues['role'];

/** The form every invite mode of one channel shares, so a switch of mode keeps the addresses. */
export function useInviteFormDraft(entityId?: string, entityType?: ChannelEntityType) {
  return useFormWithDraft<InviteFormValues>(`invite-users${entityId ? `-${entityId}` : ''}`, {
    formContainerId: inviteDialogId,
    formOptions: {
      resolver: formResolver(inviteFormSchema),
      defaultValues: { emails: [], unparsed: [], role: defaultInviteRole(entityType) },
    },
  });
}

type InviteForm = ReturnType<typeof useInviteFormDraft>;

/** What each mode's field works on: its form values, and what an invite would do with them. */
export interface InviteFieldProps {
  form: InviteForm;
  channel?: EnrichedChannel;
  check: InviteCheck;
  emails: string[];
  unparsed: string[];
}

interface UseInviteSubmitOptions {
  /** Without one the form sends a system invite. */
  channel?: EnrichedChannel;
  onSent: () => void;
  /** Takes over when a sent invite has more to say than a toast holds. */
  onResult: (result: InviteResultData) => void;
  /** After a send a toast covers. */
  onClose: () => void;
}

/** Sends the form as a membership invite to `channel`, or as a system invite without one, then says what happened. */
export function useInviteSubmit({ channel, onSent, onResult, onClose }: UseInviteSubmitOptions) {
  const { t } = useTranslation();

  const report = (result: InviteResultData) => {
    onSent();
    if (inviteResultNeedsScreen(result, t)) return onResult(result);

    onClose();
    const description = result.held && channel ? t('c:invite_result_held', { name: channel.name }) : undefined;
    toaster.success(inviteResultTitle(result, t), description ? { description } : undefined);
  };

  const { mutate: membershipInvite, isPending } = useInviteMemberMutation();
  const { mutate: systemInvite, isPending: isSystemInvitePending } = useMutation({
    mutationFn: ({ emails }: { emails: string[] }) => sendInBatches(emails, (batch) => baseSystemInvite({ body: { emails: batch } })),
  });

  const onSubmit = ({ unparsed, ...body }: InviteFormValues) => {
    if (!channel) {
      return systemInvite(body, {
        onSuccess: ({ results, unsent }) => {
          const rejected = results.flatMap(({ rejectedIds }) => rejectedIds);
          const outcomes = body.emails
            .filter((email) => !rejected.includes(email) && !unsent.includes(email))
            .map((email) => ({ email, outcome: 'invite' as const }));
          report({ outcomes, rejected, unsent, unparsed, held: false });
        },
      });
    }

    const path = { tenantId: channel.tenantId, organizationId: channelOrganizationId(channel) };
    const query = { entityId: channel.id, entityType: channel.entityType };

    membershipInvite(
      { body, path, query, channel },
      {
        onSuccess: ({ outcomes, held, unsent }) =>
          report({ outcomes, rejected: [], unsent, unparsed, held, role: body.role, entityType: channel.entityType }),
      },
    );
  };

  return { onSubmit, isPending: isPending || isSystemInvitePending };
}

interface SubmitLabelOptions {
  invite: number;
  remind: number;
  isEmpty: boolean;
  held: boolean;
}

const submitLabel = ({ invite, remind, isEmpty, held }: SubmitLabelOptions): TKey => {
  if (!invite && !remind) return isEmpty ? 'c:invite' : 'c:nothing_to_send';
  if (held) return 'c:save';
  if (invite && remind) return 'c:invite_and_remind';
  return remind ? 'c:remind' : 'c:invite';
};

interface InviteFormFooterProps {
  form: InviteForm;
  channel?: EnrichedChannel;
  check: InviteCheck;
  /** The form holds no address and no text. */
  isEmpty: boolean;
  /** The picked role's email waits for its draft channel's publish. */
  held: boolean;
  loading: boolean;
  onCancel: () => void;
  /** Takes the place of the cancel button, as the onboarding footer does. */
  children?: ReactNode;
}

/** Role choice for a channel invite, with what the role may do and when its email goes out in a draft channel, then the submit button. */
export function InviteFormFooter({ form, channel, check, isEmpty, held, loading, onCancel, children }: InviteFormFooterProps) {
  const { t } = useTranslation();

  // An address the check could not answer for still goes: the send decides, and its result says what happened.
  const invite = check.groups.new.length + check.groups.unchecked.length;
  const remind = check.groups.again.length;

  return (
    <>
      {channel && (
        <FormField
          control={form.control}
          name="role"
          render={({ field: { value, onChange } }) => (
            <FormItem className="gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <SelectRoleRadio value={value} onChange={onChange} entityType={channel.entityType} label={t('c:join_as')} />
                {value && <span className="text-muted-foreground text-sm">{t(`c:role_description.${value}`)}</span>}
              </div>
              {isUnpublishedDraft(channel) && (
                <Alert variant="info">
                  <ClockIcon />
                  <AlertDescription>
                    <NamedText
                      i18nKey={held ? 'c:invite_held.text' : 'c:invite_prepare.text'}
                      name={channel.name}
                      values={{ roles: t(`c:${value}`, { count: 2 }) }}
                    />
                  </AlertDescription>
                </Alert>
              )}
            </FormItem>
          )}
        />
      )}

      <FormActions>
        <SubmitButton disabled={!invite && !remind} loading={loading}>
          <SendIcon />
          {t(submitLabel({ invite, remind, isEmpty, held }))}
        </SubmitButton>
        {!children && <CancelButton dirty={form.isDirty} onClick={onCancel} />}
        {children}
      </FormActions>
    </>
  );
}
