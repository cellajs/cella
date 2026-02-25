import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { HeaderCell } from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useHandleInvitationMutation } from '~/modules/me/query';
import type { Invitation } from '~/modules/me/types';
import { Button } from '~/modules/ui/button';
import { UserCell } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = () => {
  const { t } = useTranslation();

  const isMobile = useBreakpoints('max', 'sm', false);

  const actionButtons = [
    { label: t('common:accept'), variant: 'darkSuccess', action: 'accept' },
    { label: t('common:reject'), variant: 'destructive', action: 'reject' },
  ] as const;

  const { mutate: handleInvitation } = useHandleInvitationMutation();

  const columns: ColumnOrColumnGroup<Invitation>[] = [
    {
      key: 'name',
      name: '',
      visible: true,
      sortable: false,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (
        <>
          <AvatarWrap
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
      visible: true,
      sortable: false,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => <span>{t(`common:${row.entity.entityType}`)}</span>,
    },
    {
      key: 'role',
      name: t('common:role'),
      sortable: false,
      visible: true,
      minWidth: 100,
      renderHeaderCell: HeaderCell,
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
      visible: !isMobile,
      minWidth: 160,
      renderHeaderCell: HeaderCell,
      placeholderValue: '-',
      renderCell: ({ row }) => dateShort(row.inactiveMembership.createdAt),
    },
    {
      key: 'createdBy',
      name: t('common:invited_by'),
      sortable: false,
      visible: !isMobile,
      minWidth: 120,
      renderHeaderCell: HeaderCell,
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
      visible: true,
      width: 200,
      renderHeaderCell: HeaderCell,
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
