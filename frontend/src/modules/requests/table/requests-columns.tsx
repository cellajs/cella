import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Request } from 'sdk';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Badge } from '~/modules/ui/badge';
import { dateShort } from '~/utils/date-short';

export const useColumns = () => {
  const { t } = useTranslation();

  const columns: ColumnOrColumnGroup<Request>[] = [
    CheckboxColumn,
    {
      key: 'type',
      name: t('c:request_type'),
      sortable: true,
      resizable: true,
      width: 160,
      renderCell: ({ row: { type, wasInvited } }) => (
        <div className="flew-row flex items-center gap-2">
          {t(`c:${type}`)}
          {type === 'waitlist' && (
            <TooltipButton
              toolTipContent={t(`c:${wasInvited ? 'pending' : 'not_processed'}`)}
              disabled={type !== 'waitlist'}
            >
              <Badge className={`h-2 w-2 justify-center p-0 ${wasInvited ? 'bg-yellow-400' : 'bg-gray-400'}`} />
            </TooltipButton>
          )}
        </div>
      ),
    },
    {
      key: 'email',
      name: t('c:email'),
      resizable: true,
      minWidth: 140,
      renderCell: ({ row, tabIndex }) => {
        return (
          <a
            href={`mailto:${row.email}`}
            tabIndex={tabIndex}
            className="truncate underline-offset-4 outline-0 ring-0 hover:underline"
          >
            {row.email || <span className="text-muted">-</span>}
          </a>
        );
      },
    },
    {
      key: 'message',
      name: t('c:message'),
      minBreakpoint: 'md',
      resizable: true,
      minWidth: 200,
      placeholderValue: '-',
      renderCell: ({ row }) =>
        row.message ? <span className="whitespace-pre-line leading-5">{row.message}</span> : null,
    },
    {
      key: 'createdAt',
      name: t('c:created_at'),
      sortable: true,
      sortDescendingFirst: true,
      minBreakpoint: 'md',
      minWidth: 120,
      placeholderValue: '-',
      renderCell: ({ row }) => dateShort(row.createdAt),
    },
  ];

  return useState<ColumnOrColumnGroup<Request>[]>(columns);
};
