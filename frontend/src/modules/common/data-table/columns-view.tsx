import { SlidersHorizontal } from 'lucide-react';
import { Dispatch, SetStateAction, useMemo, useState } from 'react';
import { ColumnOrColumnGroup as BaseColumnOrColumnGroup } from 'react-data-grid';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '~/modules/ui/dropdown-menu';
import { Input } from '~/modules/ui/input';

export type ColumnOrColumnGroup<TData> = BaseColumnOrColumnGroup<TData> & {
    visible?: boolean;
}

interface Props<TData> {
    columns: ColumnOrColumnGroup<TData>[];
    setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<TData>[]>>;
}

const ColumnsView = <TData,>({ columns, setColumns }: Props<TData>) => {
    const [columnSearch, setColumnSearch] = useState('');

    const filteredColumns = useMemo(() => columns
        .filter((column) =>
            typeof column.name === 'string' && column.name &&
            column.name
                .toLocaleLowerCase()
                .includes(columnSearch.toLocaleLowerCase())
        ), [columns, columnSearch]);

    const height = useMemo(
        () =>
            filteredColumns.length > 5
                ? 6 * 32 - 16 + 4
                : filteredColumns.length * 32 + 8,
        [filteredColumns.length]
    );

    return (
        <DropdownMenu
            onOpenChange={() => {
                setColumnSearch('');
            }}
        >
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    className="relative flex"
                >
                    {filteredColumns.some((column) => !column.visible) && (
                        <Badge className="absolute -right-1.5 -top-1.5 flex h-4 w-4 justify-center rounded-full p-0">
                            !
                        </Badge>
                    )}
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    Columns
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="start"
                className="min-w-[220px] p-0"
                collisionPadding={16}
            >
                <DropdownMenuLabel className="flex items-center justify-between">
                    <span>Toggle columns</span>
                    <Button
                        className="h-8 text-xs"
                        size="sm"
                        variant="link"
                        onClick={() => {
                            const allColumnsSelected = filteredColumns.every(
                                (column) => column.visible
                            );

                            if (allColumnsSelected) {
                                setColumns((columns) =>
                                    columns.map((column) => ({
                                        ...column,
                                        visible: false,
                                    }))
                                );
                            } else {
                                setColumns((columns) =>
                                    columns.map((column) => ({
                                        ...column,
                                        visible: true,
                                    }))
                                );
                            }
                        }}
                    >
                        {filteredColumns.every((column) => column.visible)
                            ? 'Deselect All'
                            : 'Select All'}
                    </Button>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="m-0" />
                <div className="p-2">
                    <Input
                        className="h-8 bg-background"
                        placeholder="Search..."
                        value={columnSearch}
                        onChange={(e) => setColumnSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                    />
                </div>
                <div className='overflow-y-auto relative' style={{ height }}>
                    {filteredColumns.map((column) => (
                        <DropdownMenuCheckboxItem
                            key={column.name as string}
                            className="mx-1"
                            checked={column.visible}
                            onCheckedChange={() =>
                                setColumns((columns) =>
                                    columns.map((c) =>
                                        c.name === column.name
                                            ? {
                                                ...c,
                                                visible: !c.visible,
                                            }
                                            : c
                                    )
                                )
                            }
                            onSelect={(e) => e.preventDefault()}
                        >
                            {column.name}
                        </DropdownMenuCheckboxItem>
                    ))}
                    <div className="sticky bottom-0 h-[8px] bg-gradient-to-t from-popover" />
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default ColumnsView;
