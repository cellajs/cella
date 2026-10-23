import { useTranslation } from 'react-i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation for a single-button resend flow.
import { resendPendingInvitation } from 'sdk';
import { dateColumn, emailColumn } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { ResendInvitationButton } from '~/modules/memberships/resend-invitation-button';
import type { PendingMembership } from '~/modules/memberships/types';
import { UserCell } from '~/modules/user/user-cell';

export const useColumns = (path: { tenantId: string; organizationId: string }) => {
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
      key: 'createdBy',
      name: t('c:invited_by'),

      minBreakpoint: 'md',
      minWidth: 160,
      placeholderValue: '-',
      renderCell: ({ row, tabIndex }) => row.createdBy && <UserCell compactable user={row.createdBy} tabIndex={tabIndex} />,
    },
    {
      key: 'resend',
      name: '',
      width: 120,
      renderCell: ({ row }) => (
        <ResendInvitationButton variant="ghost" size="sm" send={() => resendPendingInvitation({ path: { ...path, id: row.id } })} />
      ),
    },
  ];

  return columns;
};
