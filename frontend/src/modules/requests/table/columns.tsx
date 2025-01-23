import { useTranslation } from 'react-i18next';
import type { Request } from '~/types/common';

import { useMemo, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { Badge } from '~/modules/ui/badge';
import { dateShort } from '~/utils/date-short';

export const useColumns = () => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const columns = useMemo(() => {
    const cols: ColumnOrColumnGroup<Request>[] = [
      CheckboxColumn,
      {
        key: 'requestType',
        name: t('common:request_type'),
        sortable: true,
        visible: true,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <div className="flex flew-row gap-2 items-center">
            {t(`common:${row.type}`)}
            {row.type === 'waitlist' && <Badge className={`h-2 w-2 justify-center p-0 ${row.token ? 'bg-yellow-400 ' : 'bg-gray-400'}`} />}
          </div>
        ),
        minWidth: 160,
      },
      {
        key: 'email',
        name: t('common:email'),
        visible: true,
        sortable: false,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => <>{row.email}</>,
      },
      {
        key: 'message',
        name: t('common:message'),
        visible: !isMobile,
        sortable: false,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => <>{row.message || <span className="text-muted">-</span>}</>,
      },
      {
        key: 'createdAt',
        name: t('common:created_at'),
        sortable: true,
        visible: !isMobile,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (row.createdAt ? dateShort(row.createdAt) : <span className="text-muted">-</span>),
        minWidth: 180,
      },
    ];

    return cols;
  }, []);

  return useState<ColumnOrColumnGroup<Request>[]>(columns);
};
