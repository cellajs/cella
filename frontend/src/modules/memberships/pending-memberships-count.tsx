import { onlineManager } from '@tanstack/react-query';
import { Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { toastOffline } from '~/modules/common/toaster/toaster';
import type { EnrichedChannel } from '~/modules/entities/types';
import { Button } from '~/modules/ui/button';
import { lazyNamed } from '~/utils/lazy-named';
import { tw } from '~/utils/tw';

const PendingMembershipsTable = lazyNamed(() => import('~/modules/memberships/pending-table/pending-memberships-table'), 'PendingMembershipsTable');

type EntityWithIncluded = EnrichedChannel & Pick<Organization, 'included'>;
const hasIncluded = (channel: EnrichedChannel): channel is EntityWithIncluded => 'included' in channel;

export function PendingMembershipsCount({ channel }: { channel: EnrichedChannel }) {
  const { t, i18n } = useTranslation();
  const buttonRef = useRef(null);

  const createSheet = sheeter.getState().create;

  const openSheet = () => {
    if (!onlineManager.isOnline()) return toastOffline();

    createSheet(
      <div className="container">
        <Suspense>
          <PendingMembershipsTable channel={channel} />
        </Suspense>
      </div>,
      {
        id: 'pending-invites',
        triggerRef: buttonRef,
        side: 'right',
        className: tw('max-w-full lg:max-w-4xl'),
        title: t('c:pending_invitations'),
        description: t('c:pending_invitations.text', { entityType: t(`c:${channel.entityType}`).toLowerCase() }),
      },
    );
  };

  if (!hasIncluded(channel) || !channel.included.counts) return null;

  return (
    <Button ref={buttonRef} disabled={channel.included.counts.membership.pending < 1} variant="ghost" size="xs" onClick={openSheet}>
      {new Intl.NumberFormat(i18n.language).format(channel.included.counts.membership.pending)} {t('c:pending').toLowerCase()}
    </Button>
  );
}
