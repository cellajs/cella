import { onlineManager } from '@tanstack/react-query';
import { lazy, Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Organization } from '~/api.gen';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster/service';
import type { EnrichedContextEntity } from '~/modules/entities/types';
import { Button } from '~/modules/ui/button';

const PendingMembershipsTable = lazy(() => import('~/modules/memberships/pending-table/pending-memberships-table'));

type EntityWithIncluded = EnrichedContextEntity & Pick<Organization, 'included'>;
const hasIncluded = (entity: EnrichedContextEntity): entity is EntityWithIncluded => 'included' in entity;

/**
 * Component to display pending memberships count.
 * Users can click to open them in a table in a sheet.
 */
export const PendingMembershipsCount = ({ entity }: { entity: EnrichedContextEntity }) => {
  const { t } = useTranslation();
  const buttonRef = useRef(null);

  const createSheet = useSheeter.getState().create;

  // Open pending memberships sheet
  const openSheet = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    createSheet(
      <div className="container">
        <Suspense>
          <PendingMembershipsTable entity={entity} />
        </Suspense>
      </div>,
      {
        id: 'pending-invites',
        triggerRef: buttonRef,
        side: 'right',
        className: 'max-w-full lg:max-w-4xl',
        title: t('common:pending_invitations'),
        description: t('common:pending_invitations.text', {
          entityType: t(`common:${entity.entityType}`).toLowerCase(),
        }),
      },
    );
  };

  if (!hasIncluded(entity) || !entity.included.counts) return null;

  return (
    <Button
      ref={buttonRef}
      disabled={entity.included.counts.membership.pending < 1}
      variant="ghost"
      size="xs"
      className="font-light"
      onClick={openSheet}
    >
      {new Intl.NumberFormat('de-DE').format(entity.included.counts.membership.pending)}{' '}
      {t('common:pending').toLowerCase()}
    </Button>
  );
};
