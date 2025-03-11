import { ChevronsLeftRight, ChevronsRightLeft, Trash, Upload, XSquare } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { openAttachmentsUploadDialog } from '~/modules/attachments/table/helpers';
import type { AttachmentSearch, AttachmentsTableProps } from '~/modules/attachments/table/table-wrapper';
import type { Attachment } from '~/modules/attachments/types';
import ColumnsView from '~/modules/common/data-table/columns-view';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps, BaseTableMethods } from '~/modules/common/data-table/types';
import { FocusView } from '~/modules/common/focus-view';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';

type AttachmentsTableBarProps = AttachmentsTableProps &
  BaseTableMethods &
  BaseTableBarProps<Attachment, AttachmentSearch> & {
    highDensity: boolean;
    openRemoveDialog: () => void;
    toggleDensityView: () => void;
  };

export const AttachmentsTableBar = ({
  organization,
  total,
  selected,
  q,
  setSearch,
  columns,
  setColumns,
  highDensity,
  toggleDensityView,
  clearSelection,
  openRemoveDialog,
  isSheet = false,
  canUpload = true,
}: AttachmentsTableBarProps) => {
  const { t } = useTranslation();

  const isFiltered = !!q;
  const showUpload = canUpload && !isFiltered;

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
    <TableBarContainer>
      {/* Filter bar */}
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          {selected.length > 0 ? (
            <>
              <Button asChild variant="destructive" onClick={openRemoveDialog} className="relative">
                <motion.button layout="size" layoutRoot transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                  <Badge context="button">{selected.length}</Badge>
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
            showUpload && (
              <Button asChild onClick={() => openAttachmentsUploadDialog(organization.id)}>
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
          <TooltipButton toolTipContent={t('common:high_density_view')}>
            <Button variant="outline" onClick={toggleDensityView}>
              {highDensity ? <ChevronsRightLeft size={16} /> : <ChevronsLeftRight size={16} />}
            </Button>
          </TooltipButton>
        </FilterBarContent>
      </TableFilterBar>

      {/* Columns view */}
      <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

      {/* Focus view */}
      {!isSheet && <FocusView iconOnly />}
    </TableBarContainer>
  );
};
