import { hashKey, onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import { Suspense, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import type { TriggerRef } from '~/modules/common/dialoger/use-dialoger';
import { NamedText } from '~/modules/common/named-text';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { toastOffline } from '~/modules/common/toaster/toaster';
import type { EnrichedChannel } from '~/modules/entities/types';
import { Button } from '~/modules/ui/button';
import { getEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { queryClient } from '~/query/query-client';
import { lazyNamed } from '~/utils/lazy-named';

const PendingMembershipsList = lazyNamed(() => import('~/modules/memberships/pending-memberships-list'), 'PendingMembershipsList');

type EntityWithIncluded = EnrichedChannel & Pick<Organization, 'included'>;
const hasIncluded = (channel: EnrichedChannel): channel is EntityWithIncluded => 'included' in channel;
const countsOf = (channel?: EnrichedChannel) => (channel && hasIncluded(channel) ? channel.included.counts : undefined);

/** The channel's cached detail, read without a fetch of its own: the detail refetch after a membership change rerenders it. */
function useCachedDetail({ entityType, id }: EnrichedChannel) {
  const queryKey = getEntityQueryKeys(entityType).detail.byId(id);
  const keyHash = hashKey(queryKey);

  return useSyncExternalStore(
    (onStoreChange) =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.query.queryHash === keyHash) onStoreChange();
      }),
    () => queryClient.getQueryData<EnrichedChannel>(queryKey),
  );
}

export function openPendingMembershipsSheet(channel: EnrichedChannel, triggerRef: TriggerRef) {
  sheeter.getState().create(
    <div className="container">
      <Suspense>
        <PendingMembershipsList channel={channel} />
      </Suspense>
    </div>,
    {
      id: 'pending-invites',
      triggerRef,
      side: 'right',
      title: i18n.t('c:pending_invitations'),
      description: <NamedText i18nKey="c:pending_invitations.text" name={channel.name} />,
    },
  );
}

interface PendingMembershipsCountProps {
  channel: EnrichedChannel;
}

export function PendingMembershipsCount({ channel }: PendingMembershipsCountProps) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  // The prop is the row the bar was opened with, so an open sheet takes its count from the cached detail
  const counts = countsOf(useCachedDetail(channel)) ?? countsOf(channel);

  if (!counts) return null;
  const { pending } = counts.membership;
  if (pending < 1) return null;

  return (
    <>
      <span aria-hidden className="text-faint-foreground">
        ·
      </span>
      <Button
        ref={buttonRef}
        variant="link"
        size="auto"
        className="shrink-0"
        onClick={() => (onlineManager.isOnline() ? openPendingMembershipsSheet(channel, buttonRef) : toastOffline())}
      >
        {t('c:resource_count', { count: pending, resource: t('c:pending') })}
      </Button>
    </>
  );
}
