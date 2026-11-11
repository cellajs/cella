import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation for system-level invite called from stepper flow.
import { inviteUsers as baseSystemInvite } from 'sdk';
import { zInviteMembersBody } from 'sdk/zod.gen';
import { type ChannelEntityType, hierarchy } from 'shared';
import { z } from 'zod';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { toaster } from '~/modules/common/toaster/toaster';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import type { EnrichedChannel } from '~/modules/entities/types';
import { sendInBatches } from '~/modules/memberships/query';
import { useInviteMemberMutation } from '~/modules/memberships/query-mutations';
import { describeInviteResult, type InviteResultData } from '~/modules/user/invite-result';
import { pendingSystemInvitesQueryOptions } from '~/modules/user/query';
import type { InviteCheck } from '~/modules/user/use-invite-check';
import type { InviteList, InvitePerson } from '~/modules/user/use-invite-list';
import { formResolver } from '~/utils/form-resolver';

/** The invite dialog's id, which the form marks as unsaved and closes by. */
export const inviteDialogId = 'invite-users';

/**
 * The invite body with no limit on addresses, since they go out in batches, plus the text a list held that is no address,
 * the text on its way in (what the email field holds, and a paste nobody asked to check yet) and who an address was
 * picked as, so a restored draft still shows the person.
 */
const inviteFormSchema = zInviteMembersBody.extend({
  emails: z.array(zInviteMembersBody.shape.emails.element).min(1),
  unparsed: z.array(z.string()),
  typed: z.string().optional(),
  pasted: z.string().optional(),
  people: z.array(z.custom<InvitePerson>()).optional(),
});

type InviteFormValues = z.infer<typeof inviteFormSchema>;

export type InviteRole = InviteFormValues['role'];

/** The target vocabulary's least-privileged role; without an entity type, the organization's. */
const defaultInviteRole = (entityType?: ChannelEntityType): InviteFormValues['role'] =>
  hierarchy.getLeastPrivilegedRole(entityType ?? 'organization') as InviteFormValues['role'];

/** The form every invite mode of one channel shares, so a switch of mode keeps the addresses. */
export const useInviteFormDraft = (entityId?: string, entityType?: ChannelEntityType) =>
  useFormWithDraft<InviteFormValues>(`invite-users${entityId ? `-${entityId}` : ''}`, {
    formContainerId: inviteDialogId,
    formOptions: {
      resolver: formResolver(inviteFormSchema),
      defaultValues: { emails: [], unparsed: [], typed: '', pasted: '', people: [], role: defaultInviteRole(entityType) },
    },
  });

export type InviteForm = ReturnType<typeof useInviteFormDraft>;

/** What each mode's field works on: the list it adds to, and what an invite would do with it. */
export interface InviteFieldProps {
  channel?: EnrichedChannel;
  check: InviteCheck;
  list: InviteList;
  /** Takes focus on arrival, for a person who just picked this mode. */
  autoFocus: boolean;
  onToEmail: () => void;
}

/** What a send that stopped part way did, kept beside the addresses it could not send. */
export interface InviteReport {
  text: string;
  anySent: boolean;
  unsent: string[];
}

interface UseInviteSubmitOptions {
  /** Without one the form sends a system invite. */
  channel?: EnrichedChannel;
  /** The addresses the list shows as left out, which the report does not name again. */
  shownOut: string[];
  /** After a send that left nothing to send again, which a toast reports. */
  onDone: () => void;
  /** After a send that stopped part way: what it could not send stays in the form, beside the report. */
  onPartial: (report: InviteReport) => void;
}

/** Sends the form as a membership invite to `channel`, or as a system invite without one, then says what happened. */
export function useInviteSubmit({ channel, shownOut, onDone, onPartial }: UseInviteSubmitOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const report = (result: InviteResultData) => {
    const { title, notes, anySent } = describeInviteResult(result, shownOut, t, channel?.name);
    // The form stays, and its alert and tiles already say what waits for a publish
    const { unsent } = result;
    if (unsent.length) return onPartial({ text: [title, t('c:invite_result_unsent')].join(' · '), anySent, unsent });

    onDone();
    const description = notes.join(' ') || undefined;
    (anySent ? toaster.success : toaster.warning)(title, description ? { description } : undefined);
  };

  const { mutate: membershipInvite, isPending } = useInviteMemberMutation();
  const { mutate: inviteUsers, isPending: isSystemInvitePending } = useMutation({
    mutationFn: ({ emails }: { emails: string[] }) => sendInBatches(emails, (batch) => baseSystemInvite({ body: { emails: batch } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pendingSystemInvitesQueryOptions().queryKey }),
  });

  const onSubmit = ({ unparsed: _unparsed, typed: _typed, pasted: _pasted, people: _people, ...body }: InviteFormValues) => {
    if (!channel) {
      return inviteUsers(body, {
        onSuccess: ({ results, unsent }) => {
          const rejected = results.flatMap(({ rejectedIds }) => rejectedIds);
          const outcomes = body.emails
            .filter((email) => !rejected.includes(email) && !unsent.includes(email))
            .map((email) => ({ email, outcome: 'invite' as const }));
          report({ outcomes, rejected, unsent, held: false });
        },
      });
    }

    const path = { tenantId: channel.tenantId, organizationId: channelOrganizationId(channel) };
    const query = { entityId: channel.id, entityType: channel.entityType };

    membershipInvite(
      { body, path, query, channel },
      {
        onSuccess: ({ outcomes, held, unsent }) => report({ outcomes, rejected: [], unsent, held }),
      },
    );
  };

  return { onSubmit, isPending: isPending || isSystemInvitePending };
}
