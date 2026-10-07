import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Request } from 'sdk';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { dateColumn, emailColumn } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Badge } from '~/modules/ui/badge';
import { cn } from '~/utils/cn';

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
        <div className="flex items-center gap-2">
          {t(`c:${type}`)}
          {type === 'waitlist' && (
            <TooltipButton toolTipContent={t(`c:${wasInvited ? 'pending' : 'not_processed'}`)} disabled={type !== 'waitlist'}>
              <Badge className={cn('size-2 justify-center p-0', wasInvited ? 'bg-warning' : 'bg-muted-foreground/70')} />
            </TooltipButton>
          )}
        </div>
      ),
    },
    emailColumn({ name: t('c:email'), resizable: true }),
    {
      key: 'message',
      name: t('c:message'),
      minBreakpoint: 'md',
      resizable: true,
      minWidth: 200,
      placeholderValue: '-',
      renderCell: ({ row }) => (row.message ? <span className="whitespace-pre-line leading-5">{row.message}</span> : null),
    },
    dateColumn('createdAt', { name: t('c:created_at') }),
  ];

  return useState<ColumnOrColumnGroup<Request>[]>(columns);
};
