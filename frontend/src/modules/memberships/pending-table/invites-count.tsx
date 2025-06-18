import { lazy, Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import type { EntityPage } from '~/modules/entities/types';
import type { MembershipInvitationsTableProps } from '~/modules/memberships/pending-table/table-wrapper';
import { Button } from '~/modules/ui/button';

const MembershipInvitationsTable = lazy(() => import('~/modules/memberships/pending-table/table-wrapper'));

export const MembershipInvitations = ({ entity }: MembershipInvitationsTableProps) => {
  const { t } = useTranslation();
  const buttonRef = useRef(null);
  const createSheet = useSheeter((state) => state.create);

  const openSheet = () => {
    const SheetComponent = ({ entity }: { entity: EntityPage }) => (
      <Suspense>
        <MembershipInvitationsTable entity={entity} />
      </Suspense>
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

  if (entity.invitesCount === undefined) return null;

  return (
    <Button ref={buttonRef} disabled={entity.invitesCount < 1} variant="ghost" size="xs" className="font-light" onClick={openSheet}>
      {new Intl.NumberFormat('de-DE').format(entity.invitesCount)} {t('common:pending').toLowerCase()}
    </Button>
  );
};
