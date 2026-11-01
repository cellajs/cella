import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import { Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import type { TriggerRef } from '~/modules/common/dialoger/use-dialoger';
import { NamedText } from '~/modules/common/named-text';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { toastOffline } from '~/modules/common/toaster/toaster';
import type { EnrichedChannel } from '~/modules/entities/types';
import { Button } from '~/modules/ui/button';
import { lazyNamed } from '~/utils/lazy-named';

const PendingMembershipsList = lazyNamed(() => import('~/modules/memberships/pending-memberships-list'), 'PendingMembershipsList');

type EntityWithIncluded = EnrichedChannel & Pick<Organization, 'included'>;
const hasIncluded = (channel: EnrichedChannel): channel is EntityWithIncluded => 'included' in channel;

/** Opens a channel's pending invitations in a sheet. */
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

  if (!hasIncluded(channel) || !channel.included.counts) return null;
  const { pending } = channel.included.counts.membership;

  return (
    <Button
      ref={buttonRef}
      disabled={pending < 1}
      variant="ghost"
      size="xs"
      onClick={() => (onlineManager.isOnline() ? openPendingMembershipsSheet(channel, buttonRef) : toastOffline())}
    >
      {t('c:resource_count', { count: pending, resource: t('c:pending') })}
    </Button>
  );
}
