import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { sheet } from '~/modules/common/sheeter/state';
import type { InvitedMembersTableProps } from '~/modules/memberships/invited-members-table';
import { Button } from '~/modules/ui/button';

const InvitedMembersTable = lazy(() => import('~/modules/memberships/invited-members-table'));

export const InvitedMembers = ({ entity, total }: InvitedMembersTableProps & { total: number | undefined }) => {
  const { t } = useTranslation();

  const openSheet = () => {
    sheet.create(
      <Suspense>
        <InvitedMembersTable entity={entity} />
      </Suspense>,
      {
        className: 'max-w-full lg:max-w-4xl',
        title: t('common:pending_invitations'),
        description: t('common:pending_invitations.text', { entity: t(`common:${entity.entity}`).toLowerCase() }),
        id: `invited-members-info-${entity.id}`,
        scrollableOverlay: true,
        side: 'right',
      },
    );
  };
  if (total === undefined) return null;

  return (
    <Button disabled={total < 1} variant="ghost" size="xs" className="font-light" onClick={openSheet}>
      {new Intl.NumberFormat('de-DE').format(total)} {t('common:pending').toLowerCase()}
    </Button>
  );
};
