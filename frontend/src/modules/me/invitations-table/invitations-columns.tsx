import { useTranslation } from 'react-i18next';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { useHandleInvitationMutation } from '~/modules/me/query';
import type { Invitation } from '~/modules/me/types';
import { Button } from '~/modules/ui/button';
import { UserCell } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = () => {
  const { t } = useTranslation();

  const actionButtons = [
    { label: t('common:accept'), variant: 'success', action: 'accept' },
    { label: t('common:reject'), variant: 'destructive', action: 'reject' },
  ] as const;

  const { mutate: handleInvitation } = useHandleInvitationMutation();

  const columns: ColumnOrColumnGroup<Invitation>[] = [
    {
      key: 'name',
      name: '',
      sortable: false,
      renderCell: ({ row }) => (
        <>
          <EntityAvatar
            type={row.entity.entityType}
            className="h-8 w-8"
            id={row.entity.id}
            name={row.entity.name}
            url={row.entity.thumbnailUrl}
          />
          <span className="ml-2 truncate font-medium">{row.entity.name || '-'}</span>
        </>
      ),
    },
    {
      key: 'entityType',
      name: t('common:type'),
      sortable: false,
      renderCell: ({ row }) => <span>{t(`common:${row.entity.entityType}`)}</span>,
    },
    {
      key: 'role',
      name: t('common:role'),
      sortable: false,
      width: 100,
      placeholderValue: '-',
      renderCell: ({ row }) =>
        row.inactiveMembership.role ? (
          <div className="inline-flex items-center gap-1 relative group h-full w-full">
            {t(`common:${row.inactiveMembership.role}`)}
          </div>
        ) : null,
    },
    {
      key: 'createdAt',
      name: t('common:invited_at'),
      sortable: false,
      minBreakpoint: 'md',
      minWidth: 120,
      placeholderValue: '-',
      renderCell: ({ row }) => dateShort(row.inactiveMembership.createdAt),
    },
    {
      key: 'createdBy',
      name: t('common:invited_by'),
      sortable: false,
      minBreakpoint: 'md',
      minWidth: 160,
      placeholderValue: '-',
      renderCell: ({ row, tabIndex }) =>
        row.inactiveMembership.createdBy && (
          <UserCell compactable user={row.inactiveMembership.createdBy} tabIndex={tabIndex} />
        ),
    },
    {
      key: 'actions',
      name: '',
      sortable: false,
      width: 200,
      renderCell: ({ row }) => (
        <div className="flex gap-2 w-full max-w-50">
          {actionButtons.map(({ label, variant, action }) => (
            <Button
              className="w-full"
              key={action}
              size="xs"
              variant={variant}
              onClick={() =>
                handleInvitation({
                  path: { id: row.inactiveMembership.id, acceptOrReject: action },
                })
              }
            >
              {label}
            </Button>
          ))}
        </div>
      ),
    },
  ];

  return columns;
};
