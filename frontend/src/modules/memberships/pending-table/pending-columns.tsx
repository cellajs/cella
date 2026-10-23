import { useTranslation } from 'react-i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation for a single-button resend flow.
import { resendPendingInvitation } from 'sdk';
import { dateColumn, emailColumn } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { EnrichedChannel } from '~/modules/entities/types';
import { ResendInvitationButton } from '~/modules/memberships/resend-invitation-button';
import type { PendingMembership } from '~/modules/memberships/types';
import { WithdrawInvitationButton } from '~/modules/memberships/withdraw-invitation-button';
import { ActorCell } from '~/modules/user/actor-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = (path: { tenantId: string; organizationId: string }, channel: EnrichedChannel) => {
  const { t } = useTranslation();

  const columns: ColumnOrColumnGroup<PendingMembership>[] = [
    emailColumn({ name: t('c:email') }),
    {
      key: 'role',
      name: t('c:role'),
      width: 100,
      placeholderValue: '-',
      renderCell: ({ row }) => row.role && t(row.role),
    },
    dateColumn('createdAt', { name: t('c:invited_at') }),
    {
      ...dateColumn('remindedAt', { name: t('c:last_email'), sortable: false }),
      // A held invitation in a draft has had no email yet
      renderCell: ({ row }) => (row.remindedAt ? dateShort(row.remindedAt) : t('c:not_sent_yet')),
    },
    {
      key: 'createdBy',
      name: t('c:invited_by'),
      minBreakpoint: 'md',
      minWidth: 160,
      placeholderValue: '-',
      renderCell: ({ row, tabIndex }) => row.createdBy && <ActorCell compactable actor={row.createdBy} tabIndex={tabIndex} />,
    },
    {
      key: 'actions',
      name: '',
      width: 220,
      renderCell: ({ row }) => (
        <div className="flex gap-1">
          <ResendInvitationButton variant="ghost" size="sm" send={() => resendPendingInvitation({ path: { ...path, id: row.id } })} />
          <WithdrawInvitationButton channel={channel} invitationId={row.id} />
        </div>
      ),
    },
  ];

  return columns;
};
