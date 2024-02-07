import { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '~/lib/utils';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';

interface DataTableColumnHeaderProps<TData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
}

export const DataTableColumnHeader = <TData, TValue>({ column, title, className }: DataTableColumnHeaderProps<TData, TValue>) => {
  const { t } = useTranslation();

  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="data-[state=open]:bg-accent -ml-3 h-8">
            <span>{title}</span>
            {column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : (
              <ChevronsUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <ArrowUp className="text-muted-foreground/70 mr-2 h-3.5 w-3.5" />
            Asc
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <ArrowDown className="text-muted-foreground/70 mr-2 h-3.5 w-3.5" />
            Desc
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
            <EyeOff className="text-muted-foreground/70 mr-2 h-3.5 w-3.5" />
            {t('action.hide', {
              defaultValue: 'Hide',
            })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default DataTableColumnHeader;
