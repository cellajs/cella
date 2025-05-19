import { Trash, Upload, XSquare } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import DeleteAttachmentsForm from '~/modules/attachments/delete-attachments-form';
import { useAttachmentsUploadDialog } from '~/modules/attachments/table/helpers';
import type { AttachmentSearch, AttachmentsTableProps } from '~/modules/attachments/table/table-wrapper';
import type { Attachment } from '~/modules/attachments/types';
import ColumnsView from '~/modules/common/data-table/columns-view';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps, BaseTableMethods } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';

type AttachmentsTableBarProps = AttachmentsTableProps &
  BaseTableMethods &
  BaseTableBarProps<Attachment, AttachmentSearch> & {
    highDensity: boolean;
    toggleDensityView: (highDensity: boolean) => void;
  };

export const AttachmentsTableBar = ({
  entity,
  total,
  selected,
  searchVars,
  setSearch,
  columns,
  setColumns,
  highDensity,
  toggleDensityView,
  clearSelection,
  isSheet = false,
  canUpload = true,
}: AttachmentsTableBarProps) => {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);
  const { open } = useAttachmentsUploadDialog();
  const deleteButtonRef = useRef(null);

  const { q } = searchVars;

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

  const openDeleteDialog = () => {
    createDialog(<DeleteAttachmentsForm entity={entity} dialog attachments={selected} callback={clearSelection} />, {
      id: 'delete-attachments',
      triggerRef: deleteButtonRef,
      className: 'max-w-xl',
      title: t('common:remove_resource', { resource: t('common:attachments').toLowerCase() }),
      description: t('common:confirm.delete_resources', { resources: t('common:attachments').toLowerCase() }),
    });
  };

  return (
    <TableBarContainer>
      {/* Filter bar */}
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          {selected.length > 0 ? (
            <>
              <TableBarButton
                ref={deleteButtonRef}
                variant="destructive"
                onClick={openDeleteDialog}
                className="relative"
                badge={selected.length}
                icon={Trash}
                label={t('common:delete')}
              />

              <TableBarButton variant="ghost" onClick={clearSelection} icon={XSquare} label={t('common:clear')} />
            </>
          ) : (
            showUpload && <TableBarButton icon={Upload} label={t('common:upload')} onClick={() => open(entity.id)} />
          )}
          {selected.length === 0 && <TableCount count={total} type="attachment" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
        </FilterBarActions>
        <div className="sm:grow" />
        <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
          <TableSearch value={q} setQuery={onSearch} allowOfflineSearch={true} />
        </FilterBarContent>
      </TableFilterBar>

      {/* Columns view */}
      <ColumnsView
        className="max-lg:hidden"
        columns={columns}
        setColumns={setColumns}
        highDensity={highDensity}
        toggleDensityView={toggleDensityView}
      />

      {/* Focus view */}
      {!isSheet && <FocusView iconOnly />}
    </TableBarContainer>
  );
};
