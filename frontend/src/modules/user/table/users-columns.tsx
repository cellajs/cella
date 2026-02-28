import i18n from 'i18next';
import { PencilIcon, TrashIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBreakpoints } from '~/hooks/use-breakpoints';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { HeaderCell } from '~/modules/common/data-table/header-cell';
import { type EllipsisOption, TableEllipsis } from '~/modules/common/data-table/table-ellipsis';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { PopConfirm } from '~/modules/common/popconfirm';
import { DeleteUsers } from '~/modules/user/delete-users';
import { ImpersonateRow } from '~/modules/user/table/impersonate-row';
import { openUpdateUserSheet, UpdateRow } from '~/modules/user/table/update-row';
import type { BaseUser } from '~/modules/user/types';
import { UserCell } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm', false);

  const columns = useMemo(() => {
    const cols: ColumnOrColumnGroup<BaseUser>[] = [
      CheckboxColumn,
      {
        key: 'name',
        name: t('common:name'),
        visible: true,
        sortable: true,
        resizable: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, tabIndex }) => <UserCell user={row} tabIndex={tabIndex} className="font-medium" />,
      },
      {
        key: 'impersonate',
        name: '',
        visible: !isMobile,
        sortable: false,
        width: 32,
        renderCell: ({ row, tabIndex }) => <ImpersonateRow user={row} tabIndex={tabIndex} />,
      },
      {
        key: 'edit',
        name: '',
        visible: !isMobile,
        sortable: false,
        width: 32,
        renderCell: ({ row, tabIndex }) => <UpdateRow user={row} tabIndex={tabIndex} />,
      },
      {
        key: 'ellipsis',
        name: '',
        visible: isMobile,
        sortable: false,
        width: 32,
        renderCell: ({ row, tabIndex }) => {
          const ellipsisOptions: EllipsisOption<BaseUser>[] = [
            {
              label: i18n.t('common:edit'),
              icon: PencilIcon,
              onSelect: (row, triggerRef) => {
                useDropdowner.getState().remove();
                openUpdateUserSheet(row, triggerRef);
              },
            },
            {
              label: i18n.t('common:delete'),
              icon: TrashIcon,
              onSelect: (row) => {
                const { update } = useDropdowner.getState();
                const callback = () => useDropdowner.getState().remove();

                update({
                  content: (
                    <PopConfirm title={i18n.t('common:delete_confirm.text', { name: row.name })}>
                      <DeleteUsers users={[row]} callback={callback} />
                    </PopConfirm>
                  ),
                });
              },
            },
          ];

          return <TableEllipsis row={row} tabIndex={tabIndex} options={ellipsisOptions} />;
        },
      },
      {
        key: 'email',
        name: t('common:email'),
        sortable: false,
        visible: !isMobile,
        resizable: true,
        minWidth: 140,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, tabIndex }) => {
          return (
            <a
              href={`mailto:${row.email}`}
              tabIndex={tabIndex}
              className="truncate hover:underline underline-offset-4 decoration-foreground/20 outline-0 ring-0 font-light"
            >
              {row.email || <span className="text-muted">-</span>}
            </a>
          );
        },
      },
      {
        key: 'role',
        name: t('common:role'),
        sortable: true,
        visible: !isMobile,
        resizable: true,
        width: 100,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => <div>{row.role ? t(row.role, { ns: ['app', 'common'] }) : t('common:user')}</div>,
      },
      {
        key: 'createdAt',
        name: t('common:created_at'),
        sortable: true,
        visible: !isMobile,
        resizable: true,
        minWidth: 160,
        renderHeaderCell: HeaderCell,
        placeholderValue: '-',
        renderCell: ({ row }) => dateShort(row.createdAt),
      },
      {
        key: 'lastSeenAt',
        name: t('common:last_seen_at'),
        sortable: true,
        visible: !isMobile,
        resizable: true,
        minWidth: 160,
        renderHeaderCell: HeaderCell,
        placeholderValue: '-',
        renderCell: ({ row }) => dateShort(row.lastSeenAt),
      },
    ];

    return cols;
  }, []);

  return useState<ColumnOrColumnGroup<BaseUser>[]>(columns);
};
