import { useSearch } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import { Handshake, Trash, XSquare } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import type { RequestsSearch, RequestsTableMethods } from '.';

type RequestsTableFilterBarProps = RequestsTableMethods & {
  tableId: string;
};

export const RequestsTableFilterBar = ({ tableId, clearSelection, openInviteDialog, openRemoveDialog }: RequestsTableFilterBarProps) => {
  const { t } = useTranslation();
  const search = useSearch({ strict: false });

  const [selected, setSelected] = useState(0);
  const [total, setTotal] = useState(0);

  // Table state
  const [q, setQuery] = useState<RequestsSearch['q']>(search.q);

  const isFiltered = !!q;

  const onResetFilters = () => {
    setQuery('');
    clearSelection();
  };

  const filters = useMemo(() => ({ q }), [q]);
  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });
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
  );
};
