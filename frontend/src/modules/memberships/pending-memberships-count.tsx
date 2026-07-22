import { onlineManager } from '@tanstack/react-query';
import { Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster/toaster';
import type { EnrichedChannel } from '~/modules/entities/types';
import { Button } from '~/modules/ui/button';
import { lazyNamed } from '~/utils/lazy-named';

const PendingMembershipsTable = lazyNamed(
  () => import('~/modules/memberships/pending-table/pending-memberships-table'),
  'PendingMembershipsTable',
);

type EntityWithIncluded = EnrichedChannel & Pick<Organization, 'included'>;
const hasIncluded = (channel: EnrichedChannel): channel is EntityWithIncluded => 'included' in channel;

/**
 * Component to display pending memberships count.
 * Users can click to open them in a table in a sheet.
 */
export const PendingMembershipsCount = ({ channel }: { channel: EnrichedChannel }) => {
  const { t } = useTranslation();
  const buttonRef = useRef(null);

  const createSheet = sheeter.getState().create;

  // Open pending memberships sheet
  const openSheet = () => {
    if (!onlineManager.isOnline()) return toaster.warning(t('c:action.offline.text'));

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
        className: 'max-w-full lg:max-w-4xl',
        title: t('c:pending_invitations'),
        description: t('c:pending_invitations.text', {
          entityType: t(`c:${channel.entityType}`).toLowerCase(),
        }),
      },
    );
  };

  if (!hasIncluded(channel) || !channel.included.counts) return null;

  return (
    <Button
      ref={buttonRef}
      disabled={channel.included.counts.membership.pending < 1}
      variant="ghost"
      size="xs"
      className=""
      onClick={openSheet}
    >
      {new Intl.NumberFormat('de-DE').format(channel.included.counts.membership.pending)} {t('c:pending').toLowerCase()}
    </Button>
  );
};
