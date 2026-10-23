import { useTranslation } from 'react-i18next';
import type { Request } from 'sdk';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { dateColumn, emailColumn } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useColumnVisibility } from '~/modules/common/data-table/use-column-visibility';
import { TooltipButton } from '~/modules/common/tooltip-button';
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
      renderCell: ({ row: { type, wasInvited } }) => {
        const status = t(`c:${wasInvited ? 'pending' : 'not_processed'}`);
        return (
          <div className="flex items-center gap-2">
            {t(`c:${type}`)}
            {type === 'waitlist' && (
              <TooltipButton toolTipContent={status}>
                <span className={cn('inline-block size-2 rounded-full', wasInvited ? 'bg-warning' : 'bg-muted-foreground/70')}>
                  <span className="sr-only">{status}</span>
                </span>
              </TooltipButton>
            )}
          </div>
        );
      },
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

  return useColumnVisibility(columns);
};
