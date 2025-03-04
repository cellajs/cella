import { useTranslation } from 'react-i18next';
import type { Request } from '~/modules/requests/types';

import { useMemo, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { Badge } from '~/modules/ui/badge';
import { dateShort } from '~/utils/date-short';

export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm', false);

  const columns = useMemo(() => {
    const cols: ColumnOrColumnGroup<Request>[] = [
      CheckboxColumn,
      {
        key: 'type',
        name: t('common:request_type'),
        sortable: true,
        visible: true,
        width: 160,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row: { type, tokenId } }) => (
          <div className="flex flew-row gap-2 items-center">
            {t(`common:${type}`)}
            {type === 'waitlist' && <Badge className={`h-2 w-2 justify-center p-0 ${tokenId ? 'bg-yellow-400 ' : 'bg-gray-400'}`} />}
          </div>
        ),
      },
      {
        key: 'email',
        name: t('common:email'),
        visible: true,
        sortable: false,
        minWidth: 120,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, tabIndex }) => {
          return (
            <a href={`mailto:${row.email}`} tabIndex={tabIndex} className="truncate hover:underline underline-offset-4 outline-0 ring-0 font-light">
              {row.email || <span className="text-muted">-</span>}
            </a>
          );
        },
      },
      {
        key: 'message',
        name: t('common:message'),
        visible: !isMobile,
        sortable: false,
        minWidth: 200,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => <>{row.message || <span className="text-muted">-</span>}</>,
      },
      {
        key: 'createdAt',
        name: t('common:created_at'),
        sortable: true,
        visible: !isMobile,
        width: 180,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (row.createdAt ? dateShort(row.createdAt) : <span className="text-muted">-</span>),
      },
    ];

    return cols;
  }, []);

  return useState<ColumnOrColumnGroup<Request>[]>(columns);
};
