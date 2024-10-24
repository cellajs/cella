import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { exportToCsv, exportToPdf } from '~/lib/export';
import router from '~/lib/router';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { useThemeStore } from '~/store/theme';
import type { ColumnOrColumnGroup } from './columns-view';

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

  const onExport = async (type: 'csv' | 'pdf', selected: boolean) => {
    const rows = selected && selectedRows ? selectedRows : await fetchRows(1000);
    const filenameWithExtension = `${filename}.${type}`;
    const themeState = useThemeStore.getState();
    const mode = themeState.mode;

    if (type === 'csv') return exportToCsv(columns, rows, filenameWithExtension);

    return exportToPdf(columns, rows, filenameWithExtension, router.state.location.pathname, mode);
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
        <DropdownMenuItem onClick={() => onExport('csv', false)}>
          <span>CSV</span>
          <span className="ml-2 font-light text-xs opacity-75">{t('common:max_1k_rows')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('pdf', false)}>
          <span>PDF</span>
          <span className="ml-2 font-light text-xs opacity-75">{t('common:max_1k_rows')}</span>
        </DropdownMenuItem>
        {selectedRows && (
          <>
            <DropdownMenuItem onClick={() => onExport('csv', true)} disabled={selectedRows.length === 0}>
              <span>CSV</span>
              <span className="ml-2 font-light text-xs opacity-75">
                {selectedRows.length ? `${selectedRows.length} ${t('common:selected').toLowerCase()}` : t('common:no_selection').toLowerCase()}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('pdf', true)} disabled={selectedRows.length === 0}>
              <span>PDF</span>
              <span className="ml-2 font-light text-xs opacity-75">
                {selectedRows.length ? `${selectedRows.length} ${t('common:selected').toLowerCase()}` : t('common:no_selection').toLowerCase()}
              </span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default Export;
