import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import type { EntityPage } from '~/modules/entities/types';
import type { MembershipInvitationsTableProps } from '~/modules/memberships/pending-table/table-wrapper';
import { Button } from '~/modules/ui/button';

const MembershipInvitationsTable = lazy(() => import('~/modules/memberships/pending-table/table-wrapper'));

export const MembershipInvitations = ({ entity }: MembershipInvitationsTableProps) => {
  const { t } = useTranslation();
  const createSheet = useSheeter((state) => state.create);

  const total = entity.counts?.membership.pending;

  const openSheet = () => {
    // Wrapping this to prevent react-compiler issue?!
    const SheetComponent = ({ entity }: { entity: EntityPage }) => (
      <Suspense>
        <MembershipInvitationsTable entity={entity} />
      </Suspense>
    );

    createSheet(<SheetComponent entity={entity} />, {
      className: 'max-w-full lg:max-w-4xl',
      title: t('common:pending_invitations'),
      description: t('common:pending_invitations.text', { entity: t(`common:${entity.entity}`).toLowerCase() }),
      id: 'pending-invites',
      scrollableOverlay: true,
      side: 'right',
    });
  };

  if (total === undefined) return null;

  return (
    <Button disabled={total < 1} variant="ghost" size="xs" className="font-light" onClick={openSheet}>
      {new Intl.NumberFormat('de-DE').format(total)} {t('common:pending').toLowerCase()}
    </Button>
  );
};
