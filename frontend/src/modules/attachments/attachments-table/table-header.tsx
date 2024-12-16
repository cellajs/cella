import { motion } from 'framer-motion';
import { Trash, Upload, XSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AttachmentSearch, AttachmentsTableProps } from '~/modules/attachments/attachments-table';
import { openUploadDialog } from '~/modules/attachments/attachments-table/helpers';
import ColumnsView from '~/modules/common/data-table/columns-view';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { FocusView } from '~/modules/common/focus-view';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import type { Attachment, BaseTableHeaderProps, BaseTableMethods } from '~/types/common';

type AttachmentsTableHeaderProps = AttachmentsTableProps &
  BaseTableMethods &
  BaseTableHeaderProps<Attachment, AttachmentSearch> & {
    openRemoveDialog: () => void;
  };

export const AttachmentsTableHeader = ({
  organization,
  total,
  selected,
  q,
  setSearch,
  columns,
  setColumns,
  clearSelection,
  openRemoveDialog,
  isSheet = false,
  canUpload = true,
}: AttachmentsTableHeaderProps) => {
  const { t } = useTranslation();

  const isFiltered = !!q;
  const isAdmin = organization.membership?.role === 'admin';

  // Drop selected rows on search
  const onSearch = (searchString: string) => {
    clearSelection();
    setSearch({ q: searchString });
  };

  const onResetFilters = () => {
    setSearch({ q: '' });
    clearSelection();
  };

  return (
    <div className={'flex items-center max-sm:justify-between md:gap-2'}>
      {/* Filter bar */}
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          {selected.length > 0 ? (
            <>
              <Button asChild variant="destructive" onClick={openRemoveDialog} className="relative">
                <motion.button layout="size" layoutRoot transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                  <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5 animate-in zoom-in">{selected.length}</Badge>
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
            canUpload &&
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
          {selected.length === 0 && <TableCount count={total} type="attachment" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
        </FilterBarActions>
        <div className="sm:grow" />
        <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
          <TableSearch value={q} setQuery={onSearch} />
        </FilterBarContent>
      </TableFilterBar>

      {/* Columns view */}
      <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

      {/* Focus view */}
      {!isSheet && <FocusView iconOnly />}
    </div>
  );
};
