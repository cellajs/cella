import { Download } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { exportToCsv, exportToPdf } from '~/lib/export';
import router from '~/lib/router';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { type Theme, useThemeStore } from '~/store/theme';
import { TooltipButton } from '../tooltip-button';

interface Props<R> {
  filename: string;
  columns: { key: string; name: ReactElement | string }[];
  selectedRows: R[];
  fetchRows: (limit: number) => Promise<R[]>;
  className?: string;
}

const Export = <R extends object>({ filename, columns, selectedRows, fetchRows, className = '' }: Props<R>) => {
  const { t } = useTranslation();

  const onExport = async (type: 'csv' | 'pdf', selected: boolean) => {
    const rows = selected ? selectedRows : await fetchRows(1000);
    const filenameWithExtension = `${filename}.${type}`;
    const themeState = useThemeStore.getState();
    const theme: Theme = themeState.mode;

    if (type === 'csv') return exportToCsv(columns, rows, filenameWithExtension);

    return exportToPdf(columns, rows, filenameWithExtension, router.state.location.pathname, theme);
  };

  return (
    <DropdownMenu>
      <TooltipButton className={className} toolTipContent={t('common:export_pdf_csv')}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="flex max-xs:hidden"
            onClick={() => {
              toast.error(t('common:error.image_upload_failed'));
            }}
          >
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default Export;
