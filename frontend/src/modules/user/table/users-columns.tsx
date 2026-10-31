import { PencilIcon, TrashIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { dateColumn, ellipsisColumn, emailColumn } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useColumnVisibility } from '~/modules/common/data-table/use-column-visibility';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { DeleteQuestion } from '~/modules/common/popconfirm';
import { openEditSheet } from '~/modules/common/sheeter/open-edit-sheet';
import type { TriggerRef } from '~/modules/common/sheeter/use-sheeter';
import { DeleteUsers } from '~/modules/user/delete-users';
import { ImpersonateCell } from '~/modules/user/table/impersonate-cell';
import type { BaseUser } from '~/modules/user/types';
import { UpdateUserForm } from '~/modules/user/update-user-form';
import { UserCell } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

export const openUpdateUserSheet = (user: BaseUser, triggerRef: TriggerRef) =>
  openEditSheet({
    id: 'update-user',
    resource: 'c:user',
    triggerRef,
    className: 'container',
    children: <UpdateUserForm user={user} sheet />,
  });

export const useColumns = () => {
  const { t } = useTranslation();

  const columns: ColumnOrColumnGroup<BaseUser>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: t('c:name'),
      sortable: true,
      minWidth: 200,
      resizable: true,
      renderCell: ({ row, tabIndex }) => <UserCell user={row} email={row.email} tabIndex={tabIndex} className="font-medium" />,
    },
    {
      key: 'impersonate',
      name: '',
      minBreakpoint: 'md',
      width: 32,
      renderCell: ({ row, tabIndex }) => <ImpersonateCell user={row} tabIndex={tabIndex} />,
    },
    ellipsisColumn<BaseUser>(() => [
      {
        label: t('c:edit'),
        icon: PencilIcon,
        onSelect: (row, triggerRef) => {
          dropdowner.getState().remove();
          openUpdateUserSheet(row, triggerRef);
        },
      },
      {
        label: t('c:delete'),
        icon: TrashIcon,
        variant: 'destructive',
        confirm: (row) => ({
          title: <DeleteQuestion resource="c:user" name={row.name} />,
          content: <DeleteUsers users={[row]} />,
        }),
      },
    ]),
    emailColumn({ name: t('c:email'), minBreakpoint: 'md', resizable: true, cellClass: 'text-muted-foreground' }),
    {
      key: 'role',
      name: t('c:role'),
      sortable: true,
      minBreakpoint: 'md',
      resizable: true,
      width: 100,
      renderCell: ({ row }) => (row.role ? t(`c:${row.role}`) : t('c:user')),
    },
    dateColumn('createdAt', { name: t('c:created_at') }),
    {
      key: 'lastSeenAt',
      name: t('c:last_seen_at'),
      sortable: true,
      minBreakpoint: 'md',
      minWidth: 120,
      placeholderValue: '-',
      renderCell: ({ row }) => dateShort(row.lastSeenAt),
    },
  ];

  return useColumnVisibility(columns);
};
