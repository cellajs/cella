import { onlineManager } from '@tanstack/react-query';
import { BirdIcon, MailIcon, XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation for a single-button resend flow.
import { resendInvitation } from 'sdk';
import { lowercaseLabel } from 'shared/utils/i18n-text';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { useInfiniteRows } from '~/modules/common/data-table/use-infinite-rows';
import { ExpandableTile, ExpandableTileDetail, TileListHeading } from '~/modules/common/expandable-tile';
import { MiddleCut } from '~/modules/common/middle-cut';
import { toaster, toastOffline } from '~/modules/common/toaster/toaster';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import type { EnrichedChannel } from '~/modules/entities/types';
import { channelInvitationsQueryOptions } from '~/modules/memberships/query';
import { useWithdrawInvitationMutation } from '~/modules/memberships/query-mutations';
import { ResendInvitationButton } from '~/modules/memberships/resend-invitation-button';
import type { ChannelInvitation } from '~/modules/memberships/types';
import { Accordion } from '~/modules/ui/accordion';
import { Button } from '~/modules/ui/button';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';
import { queryClient } from '~/query/query-client';
import { dateRelative } from '~/utils/date-mini';
import { dateShort } from '~/utils/date-short';

/** Withdraws a pending invitation, such as one sent to a mistyped address; inviting the address again undoes it. */
function WithdrawInvitationButton({ channel, invitationId }: { channel: EnrichedChannel; invitationId: string }) {
  const { t } = useTranslation();
  const { mutate, isPending } = useWithdrawInvitationMutation();

  const withdraw = () => {
    if (!onlineManager.isOnline()) return toastOffline();
    mutate({ channel, id: invitationId }, { onSuccess: () => toaster.success(t('c:success.withdraw_invitation')) });
  };

  return (
    <Button variant="ghost" size="sm" onClick={withdraw} loading={isPending}>
      <XIcon />
      {t('c:withdraw')}
    </Button>
  );
}

interface PendingTileProps {
  row: ChannelInvitation;
  channel: EnrichedChannel;
  /** Called after a resend, to refresh the list. */
  onResent: () => Promise<unknown>;
}

function PendingTile({ row, channel, onResent }: PendingTileProps) {
  const { t } = useTranslation();
  const { id, email, role, status, createdAt, mailedAt, linkExpiresAt, createdBy } = row;

  const describe = () => {
    if (status === 'held') return { tone: 'muted', label: t('c:not_sent_yet'), detail: t('c:invite_state_on_publish') } as const;
    // Pending with no mail: the tenant mailed the address within the day, or the mail failed.
    if (!mailedAt || !linkExpiresAt) return { tone: 'warning', label: t('c:not_sent_yet'), detail: t('c:pending_not_mailed') } as const;
    if (Date.parse(linkExpiresAt) < Date.now()) {
      return { tone: 'warning', label: t('c:pending_expired'), detail: t('c:pending_last_email', { date: dateShort(mailedAt) }) } as const;
    }
    return { tone: 'info', label: t('c:pending_sent'), detail: t('c:pending_link_expires', { time: dateRelative(linkExpiresAt) }) } as const;
  };
  const { tone, label, detail } = describe();

  const resend = async () => {
    const path = { tenantId: channel.tenantId, organizationId: channelOrganizationId(channel), invitationId: id };
    await resendInvitation({ path });
    await onResent();
  };

  return (
    <ExpandableTile
      value={id}
      icon={<MailIcon className="text-muted-foreground" />}
      title={<MiddleCut text={email} />}
      status={{ tone, label }}
      meta={`${t(`c:${role}`)} · ${lowercaseLabel(detail)}`}
      details={
        <>
          <ExpandableTileDetail label={t('c:invited_at')}>{dateShort(createdAt)}</ExpandableTileDetail>
          <ExpandableTileDetail label={t('c:last_email')}>{mailedAt ? dateShort(mailedAt) : t('c:not_sent_yet')}</ExpandableTileDetail>
          <ExpandableTileDetail label={t('c:invited_by')}>{createdBy.name}</ExpandableTileDetail>
        </>
      }
      actions={
        <>
          {status === 'pending' && <ResendInvitationButton variant="secondary" size="sm" send={resend} />}
          <WithdrawInvitationButton channel={channel} invitationId={id} />
        </>
      }
    />
  );
}

/** A channel's pending invitations as tiles, newest first. */
export function ChannelInvitationsList({ channel }: { channel: EnrichedChannel }) {
  const { t } = useTranslation();

  const queryOptions = channelInvitationsQueryOptions({
    entityId: channel.id,
    entityType: channel.entityType,
    tenantId: channel.tenantId,
    organizationId: channelOrganizationId(channel),
  });
  const { rows = [], isLoading, hasNextPage, fetchMore, isFetching } = useInfiniteRows(queryOptions);
  const total = useListQueryTotal(queryOptions.queryKey) ?? rows.length;

  if (!isLoading && !rows.length) return <ContentPlaceholder icon={BirdIcon} title="c:no_resource_yet" titleOptions={{ resource: t('c:invites') }} />;

  return (
    <Accordion className="flex flex-col gap-2">
      <TileListHeading title={t('c:pending_waiting')} count={total} />
      {rows.map((row) => (
        <PendingTile key={row.id} row={row} channel={channel} onResent={() => queryClient.invalidateQueries({ queryKey: queryOptions.queryKey })} />
      ))}
      {hasNextPage && (
        <Button variant="ghost" className="w-full" loading={isFetching} onClick={() => fetchMore()}>
          {t('c:show_more', { count: total - rows.length })}
        </Button>
      )}
    </Accordion>
  );
}
