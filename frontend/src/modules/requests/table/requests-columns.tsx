import { useTranslation } from 'react-i18next';
import type { Request } from 'sdk';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { dateColumn, emailColumn } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useColumnVisibility } from '~/modules/common/data-table/use-column-visibility';
import { StatusDot } from '~/modules/common/status-dot';
import { TooltipButton } from '~/modules/common/tooltip-button';

export const useColumns = () => {
  const { t } = useTranslation();

  const columns: ColumnOrColumnGroup<Request>[] = [
    CheckboxColumn,
    {
      key: 'kind',
      name: t('c:request_type'),
      sortable: true,
      resizable: true,
      width: 160,
      renderCell: ({ row: { kind, invited } }) => {
        const status = invited ? t('c:pending') : t('c:not_processed');
        return (
          <div className="flex items-center gap-2">
            {t(`c:${kind}`)}
            {kind === 'waitlist' && (
              <TooltipButton toolTipContent={status}>
                <StatusDot variant={invited ? 'warning' : 'muted'} pulse={false} label={status} />
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
      renderCell: ({ row }) => (row.message ? <span className="leading-5 whitespace-pre-line">{row.message}</span> : null),
    },
    dateColumn('createdAt', { name: t('c:created_at') }),
  ];

  return useColumnVisibility(columns);
};
