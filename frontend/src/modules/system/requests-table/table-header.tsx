import { config } from 'config';
import { motion } from 'framer-motion';
import { Handshake, Trash, XSquare } from 'lucide-react';
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ColumnsView, { type ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { FocusView } from '~/modules/common/focus-view';
import type { RequestsTableMethods } from '~/modules/system/requests-table';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import type { Request } from '~/types/common';

type RequestsTableHeaderBarProps = RequestsTableMethods & {
  tableId: string;
  q: string;
  setQuery: (q: string) => void;
  columns: ColumnOrColumnGroup<Request>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<Request>[]>>;
  fetchExport: (limit: number) => Promise<Request[]>;
};

export const RequestsTableHeaderBar = ({
  tableId,
  q,
  setQuery,
  columns,
  setColumns,
  clearSelection,
  openInviteDialog,
  openRemoveDialog,
  fetchExport,
}: RequestsTableHeaderBarProps) => {
  const { t } = useTranslation();

  const [selected, setSelected] = useState(0);
  const [total, setTotal] = useState(0);

  const isFiltered = !!q;

  const onResetFilters = () => {
    setQuery('');
    clearSelection();
  };

  useEffect(() => {
    const table = document.getElementById(tableId);
    if (!table) return;

    // Create a MutationObserver to watch for attribute changes
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== 'attributes' || (mutation.attributeName !== 'data-selected' && mutation.attributeName !== 'data-total-count')) return;

        if (mutation.attributeName === 'data-selected') {
          const selectedValue = table.getAttribute('data-selected');
          setSelected(Number(selectedValue) || 0);
        }
        if (mutation.attributeName === 'data-total-count') {
          const totalValue = table.getAttribute('data-total-count');
          setTotal(Number(totalValue) || 0);
        }
      }
    });

    // Configure the observer to watch for attribute changes
    observer.observe(table, {
      attributes: true,
    });
    return () => observer.disconnect();
  }, [tableId]);

  return (
    <div className={'flex items-center max-sm:justify-between md:gap-2'}>
      {/* Filter bar */}

      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          {selected > 0 && (
            <>
              <div className="relative inline-flex items-center gap-2">
                <Badge className="px-1 py-0 min-w-5 flex justify-center  animate-in zoom-in">{selected}</Badge>
                <Button asChild variant="success" onClick={openInviteDialog}>
                  <motion.button layout="size" layoutRoot transition={{ duration: 0.1 }} layoutId="req-filter-bar-button-invite">
                    <motion.span layoutId="req-filter-bar-icon-successes">
                      <Handshake size={16} />
                    </motion.span>
                    <span className="ml-1 max-xs:hidden">{t('common:accept')}</span>
                  </motion.button>
                </Button>

                <Button asChild variant="destructive" onClick={openRemoveDialog}>
                  <motion.button layout="size" layoutRoot transition={{ duration: 0.1 }} layoutId="req-filter-bar-button-delete">
                    <motion.span layoutId="req-filter-bar-icon-delete">
                      <Trash size={16} />
                    </motion.span>
                    <span className="ml-1 max-xs:hidden">{t('common:delete')}</span>
                  </motion.button>
                </Button>
              </div>
              <Button asChild variant="ghost" onClick={clearSelection}>
                <motion.button
                  transition={{
                    bounce: 0,
                    duration: 0.2,
                  }}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -20, opacity: 0 }}
                >
                  <XSquare size={16} />
                  <span className="ml-1">{t('common:clear')}</span>{' '}
                </motion.button>
              </Button>
            </>
          )}
          {selected === 0 && <TableCount count={total} type="request" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
        </FilterBarActions>

        <div className="sm:grow" />

        <FilterBarContent>
          <TableSearch value={q} setQuery={setQuery} />
        </FilterBarContent>
      </TableFilterBar>

      {/* Columns view */}
      <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

      {/* Export */}
      <Export className="max-lg:hidden" filename={`${config.slug}-requests`} columns={columns} fetchRows={fetchExport} />

      {/* Focus view */}
      <FocusView iconOnly />
    </div>
  );
};
