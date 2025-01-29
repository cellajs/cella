import { Suspense, lazy, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryClient } from '~/lib/router';
import { sheet } from '~/modules/common/sheeter/state';
import type { InvitedMembersTableProps } from '~/modules/memberships/invited-members-table';
import { invitedMembersQueryOptions } from '../query';

const InvitedMembersTable = lazy(() => import('~/modules/memberships/invited-members-table'));

export const InvitedMembers = ({ entity }: InvitedMembersTableProps) => {
  const { t } = useTranslation();

  const [total, setTotal] = useState<number | null>(null);
  const entityType = entity.entity;
  const organizationId = entity.organizationId || entity.id;

  // Fetching data
  queryClient
    .fetchInfiniteQuery(
      invitedMembersQueryOptions({
        idOrSlug: entity.slug,
        entityType,
        orgIdOrSlug: organizationId,
      }),
    )
    .then((data) => {
      setTotal(data.pages[0].total);
    });

  const openInfoSheet = () => {
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
  if (total === null) return null;

  return (
    <button
      disabled={!total}
      type="button"
      onClick={openInfoSheet}
      className="flex max-sm:hidden rounded text-sm ring-offset-background items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none"
    >
      {new Intl.NumberFormat('de-DE').format(total)} {total === 1 ? t('common:invite').toLowerCase() : t('common:invites').toLowerCase()}
    </button>
  );
};
