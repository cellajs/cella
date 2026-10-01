import i18n from 'i18next';
import { PencilIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { dateColumn, ellipsisColumn } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { openPopConfirm } from '~/modules/common/popconfirm';
import { openEditSheet } from '~/modules/common/sheeter/open-edit-sheet';
import type { TriggerRef } from '~/modules/common/sheeter/use-sheeter';
import { DeleteUsers } from '~/modules/user/delete-users';
import { ImpersonateRow } from '~/modules/user/table/impersonate-row';
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
      renderCell: ({ row, tabIndex }) => <UserCell user={row} tabIndex={tabIndex} className="font-medium" />,
    },
    {
      key: 'impersonate',
      name: '',
      minBreakpoint: 'md',
      width: 32,
      renderCell: ({ row, tabIndex }) => <ImpersonateRow user={row} tabIndex={tabIndex} />,
    },
    ellipsisColumn<BaseUser>(() => [
      {
        label: i18n.t('c:edit'),
        icon: PencilIcon,
        onSelect: (row, triggerRef) => {
          useDropdowner.getState().remove();
          openUpdateUserSheet(row, triggerRef);
        },
      },
      {
        label: i18n.t('c:delete'),
        icon: TrashIcon,
        onSelect: (row) => {
          const callback = () => useDropdowner.getState().remove();
          openPopConfirm(i18n.t('c:delete_confirm.text', { name: row.name }), <DeleteUsers users={[row]} callback={callback} />);
        },
      },
    ]),
    {
      key: 'email',
      name: t('c:email'),
      minBreakpoint: 'md',
      resizable: true,
      minWidth: 140,
      renderCell: ({ row, tabIndex }) => {
        return (
          <a
            href={`mailto:${row.email}`}
            tabIndex={tabIndex}
            className="truncate decoration-foreground/20 underline-offset-4 outline-0 ring-0 hover:underline"
          >
            {row.email || <span className="text-muted">-</span>}
          </a>
        );
      },
    },
    {
      key: 'role',
      name: t('c:role'),
      sortable: true,
      minBreakpoint: 'md',
      resizable: true,
      width: 100,
      renderCell: ({ row }) => <div>{row.role ? t(row.role) : t('c:user')}</div>,
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

  return useState<ColumnOrColumnGroup<BaseUser>[]>(columns);
};
