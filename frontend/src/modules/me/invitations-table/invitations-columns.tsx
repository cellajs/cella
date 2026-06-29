import { useMemo } from 'react';
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
    { label: t('c:accept'), variant: 'success', action: 'accept' },
    { label: t('c:reject'), variant: 'destructive', action: 'reject' },
  ] as const;

  const { mutate: handleInvitation } = useHandleInvitationMutation();

  const columns: ColumnOrColumnGroup<Invitation>[] = useMemo(
    () => [
      {
        key: 'name',
        name: '',

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
        name: t('c:type'),

        renderCell: ({ row }) => <span>{t(`c:${row.entity.entityType}`)}</span>,
      },
      {
        key: 'role',
        name: t('c:role'),

        width: 100,
        placeholderValue: '-',
        renderCell: ({ row }) =>
          row.inactiveMembership.role ? (
            <div className="group relative inline-flex h-full w-full items-center gap-1">
              {t(`c:${row.inactiveMembership.role}`)}
            </div>
          ) : null,
      },
      {
        key: 'createdAt',
        name: t('c:invited_at'),

        minBreakpoint: 'md',
        minWidth: 120,
        placeholderValue: '-',
        renderCell: ({ row }) => dateShort(row.inactiveMembership.createdAt),
      },
      {
        key: 'createdBy',
        name: t('c:invited_by'),

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

        width: 200,
        renderCell: ({ row }) => (
          <div className="flex w-full max-w-50 gap-2">
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
    ],
    [],
  );

  return columns;
};
