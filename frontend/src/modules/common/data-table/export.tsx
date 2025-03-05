import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { exportToCsv, exportToPdf } from '~/lib/export';
import router from '~/lib/router';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { toaster } from '~/modules/common/toaster';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { useUIStore } from '~/store/ui';

interface Props<TData> {
  filename: string;
  columns: ColumnOrColumnGroup<TData>[];
  selectedRows?: TData[];
  fetchRows: (limit: number) => Promise<TData[]>;
  className?: string;
}

// biome-ignore lint/suspicious/noExplicitAny: any is required here
const Export = <R extends Record<string, any>>({ filename, columns, selectedRows, fetchRows, className = '' }: Props<R>) => {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();
  const mode = useUIStore.getState().mode;

  const exportDefault = async (type: 'csv' | 'pdf') => {
    if (!isOnline) return toaster(t('common:action.offline.text'), 'warning');
    const rows = await fetchRows(1000);
    const filenameWithExtension = `${filename}.${type}`;

    if (type === 'csv') return exportToCsv(columns, rows, filenameWithExtension);
    return exportToPdf(columns, rows, filenameWithExtension, router.state.location.pathname, mode);
  };

  const exportSelected = async (type: 'csv' | 'pdf') => {
    if (!selectedRows) return toaster(t('error:no_selected_rows'), 'warning');
    const filenameWithExtension = `${filename}.${type}`;

    if (type === 'csv') return exportToCsv(columns, selectedRows, filenameWithExtension);

    if (!isOnline) toaster(t('common:action.offline.text'), 'warning');
    return exportToPdf(columns, selectedRows, filenameWithExtension, router.state.location.pathname, mode);
  };

  return (
    <DropdownMenu>
      <TooltipButton className={className} toolTipContent={t('common:export_pdf_csv')}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="flex max-xs:hidden">
            <Download size={16} />
            <span className="ml-1 max-xl:hidden">{t('common:export')}</span>
          </Button>
        </DropdownMenuTrigger>
      </TooltipButton>
      <DropdownMenuContent align="end">
        {isOnline && (
          <>
            <DropdownMenuItem onClick={() => exportDefault('csv')}>
              <span>CSV</span>
              <span className="ml-2 font-light text-xs opacity-75">{t('common:max_1k_rows')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportDefault('pdf')}>
              <span>PDF</span>
              <span className="ml-2 font-light text-xs opacity-75">{t('common:max_1k_rows')}</span>
            </DropdownMenuItem>
          </>
        )}
        {selectedRows && (
          <>
            <DropdownMenuItem onClick={() => exportSelected('csv')} disabled={selectedRows.length === 0}>
              <span>CSV</span>
              <span className="ml-2 font-light text-xs opacity-75">
                {selectedRows.length ? `${selectedRows.length} ${t('common:selected').toLowerCase()}` : t('common:no_selection').toLowerCase()}
              </span>
            </DropdownMenuItem>

            {isOnline && (
              <DropdownMenuItem onClick={() => exportSelected('pdf')} disabled={selectedRows.length === 0}>
                <span>PDF</span>
                <span className="ml-2 font-light text-xs opacity-75">
                  {selectedRows.length ? `${selectedRows.length} ${t('common:selected').toLowerCase()}` : t('common:no_selection').toLowerCase()}
                </span>
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default Export;
