import { motion } from 'framer-motion';
import { Trash, Upload, XSquare } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import ColumnsView from '~/modules/common/data-table/columns-view';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { FocusView } from '~/modules/common/focus-view';
import type { AttachmentsTableProps } from '~/modules/organizations/attachments-table';
import { openUploadDialog } from '~/modules/organizations/attachments-table/helpers';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import type { Attachment, BaseTableHeaderProps, BaseTableMethods } from '~/types/common';

type AttachmentsTableHeaderProps = AttachmentsTableProps & BaseTableMethods & BaseTableHeaderProps<Attachment>;

export const AttachmentsTableHeader = ({
  organization,
  tableId,
  q,
  setQuery,
  columns,
  setColumns,
  clearSelection,
  openRemoveDialog,
  isSheet = false,
  canUploadAttachments = true,
}: AttachmentsTableHeaderProps) => {
  const { t } = useTranslation();

  const [selected, setSelected] = useState(0);
  const [total, setTotal] = useState(0);

  const isFiltered = !!q;
  const isAdmin = organization.membership?.role === 'admin';

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
    <div className={'flex items-center max-sm:justify-between md:gap-2'}>
      {/* Filter bar */}
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          {selected > 0 ? (
            <>
              <Button asChild variant="destructive" onClick={openRemoveDialog} className="relative">
                <motion.button layout="size" layoutRoot transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                  <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5 animate-in zoom-in">{selected}</Badge>
                  <motion.span layoutId="attachments-filter-bar-icon">
                    <Trash size={16} />
                  </motion.span>

                  <span className="ml-1 max-xs:hidden">{t('common:remove')}</span>
                </motion.button>
              </Button>

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
                  <span className="ml-1">{t('common:clear')}</span>
                </motion.button>
              </Button>
            </>
          ) : (
            canUploadAttachments &&
            !isFiltered &&
            isAdmin && (
              <Button asChild onClick={() => openUploadDialog(organization.id)}>
                <motion.button transition={{ duration: 0.1 }} layoutId="attachments-filter-bar-button">
                  <motion.span layoutId="attachments-filter-bar-icon">
                    <Upload size={16} />
                  </motion.span>
                  <span className="ml-1">{t('common:upload')}</span>
                </motion.button>
              </Button>
            )
          )}
          {selected === 0 && <TableCount count={total} type="attachment" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
        </FilterBarActions>
        <div className="sm:grow" />
        <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
          <TableSearch value={q} setQuery={setQuery} />
        </FilterBarContent>
      </TableFilterBar>

      {/* Columns view */}
      <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

      {/* Focus view */}
      {!isSheet && <FocusView iconOnly />}
    </div>
  );
};
