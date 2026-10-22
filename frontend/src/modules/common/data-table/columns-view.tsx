import { SlidersHorizontalIcon } from 'lucide-react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';

interface ColumnsViewProps<TData> {
  columns: ColumnOrColumnGroup<TData>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<TData>[]>>;
  className?: string;
  children?: ReactNode;
}

export function ColumnsView<TData>({ columns, setColumns, className, children }: ColumnsViewProps<TData>) {
  const { t } = useTranslation();
  // Columns without a text name (checkbox, ellipsis) have nothing to list
  const namedColumns = columns.filter((column) => typeof column.name === 'string' && column.name);
  const hasHidden = namedColumns.some((column) => column.hidden);

  return (
    <DropdownMenu>
      <TooltipButton className={className} toolTipContent={t('c:columns_view')}>
        <DropdownMenuTrigger render={<Button variant="outline" className="relative flex" />}>
          {hasHidden && <Badge className="absolute -top-1 -right-1 z-10 size-2 p-0" />}
          <SlidersHorizontalIcon />
          <span className="max-xl:hidden">{t('c:view')}</span>
          {hasHidden && <span className="sr-only">{t('c:columns_hidden')}</span>}
        </DropdownMenuTrigger>
      </TooltipButton>
      <DropdownMenuContent align="end" className="min-w-56" collisionPadding={16}>
        {namedColumns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.key}
            checked={!column.hidden}
            onCheckedChange={() => setColumns((prev) => prev.map((item) => (item.key === column.key ? { ...item, hidden: !item.hidden } : item)))}
          >
            {column.name}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator className="last:hidden" />
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
