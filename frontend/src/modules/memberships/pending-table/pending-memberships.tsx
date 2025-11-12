import { onlineManager } from '@tanstack/react-query';
import { WifiOffIcon } from 'lucide-react';
import { lazy, Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import type { EntityPage } from '~/modules/entities/types';
import type { PendingMembershipsTableProps } from '~/modules/memberships/pending-table';
import { Button } from '~/modules/ui/button';

const PendingTable = lazy(() => import('~/modules/memberships/pending-table'));

export const PendingMemberships = ({ entity }: PendingMembershipsTableProps) => {
  const { t } = useTranslation();
  const buttonRef = useRef(null);
  const createSheet = useSheeter((state) => state.create);

  const openSheet = () => {
    const SheetComponent = ({ entity }: { entity: EntityPage }) =>
      onlineManager.isOnline() ? (
        <Suspense>
          <div className="container w-full">
            <PendingTable entity={entity} />
          </div>
        </Suspense>
      ) : (
        <ContentPlaceholder icon={WifiOffIcon} title={t(`${'common:offline.text'}`)} />
      );

    createSheet(<SheetComponent entity={entity} />, {
      id: 'pending-invites',
      triggerRef: { current: document.activeElement instanceof HTMLButtonElement ? document.activeElement : null },
      side: 'right',
      className: 'max-w-full lg:max-w-4xl',
      title: t('common:pending_invitations'),
      description: t('common:pending_invitations.text', { entityType: t(`common:${entity.entityType}`).toLowerCase() }),
      scrollableOverlay: true,
    });
  };

  if (!entity.counts) return null;

  return (
    <Button ref={buttonRef} disabled={entity.counts.membership.pending < 1} variant="ghost" size="xs" className="font-light" onClick={openSheet}>
      {new Intl.NumberFormat('de-DE').format(entity.counts.membership.pending)} {t('common:pending').toLowerCase()}
    </Button>
  );
};
