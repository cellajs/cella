import { config } from 'config';
import { Handshake, Mail, Trash, XSquare } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps, BaseTableMethods } from '~/modules/common/data-table/types';
import { FocusView } from '~/modules/common/focus-view';
import type { RequestsSearch } from '~/modules/requests/table/table-wrapper';
import type { Request } from '~/modules/requests/types';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';

type RequestsTableBarProps = BaseTableMethods &
  BaseTableBarProps<Request, RequestsSearch> & {
    openInviteDialog: () => void;
    openRemoveDialog: () => void;
    fetchExport: (limit: number) => Promise<Request[]>;
  };

export const RequestsTableBar = ({
  total,
  selected,
  q,
  setSearch,
  columns,
  setColumns,
  clearSelection,
  openInviteDialog,
  openRemoveDialog,
  fetchExport,
}: RequestsTableBarProps) => {
  const { t } = useTranslation();

  const selectedToWaitlist = useMemo(() => selected.filter((r) => r.type === 'waitlist' && !r.tokenId), [selected]);
  const selectedContact = useMemo(() => selected.filter((r) => r.type !== 'waitlist'), [selected]);

  const isFiltered = !!q;
  // Drop selected Rows on search
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
          {selected.length > 0 && (
            <>
              {selectedContact.length > 0 && (
                <Button className="relative">
                  <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5">{selectedContact.length}</Badge>
                  <Mail size={16} />
                  <span className="ml-1 max-xs:hidden">{t('common:email')}</span>
                </Button>
              )}
              {selectedToWaitlist.length > 0 && (
                <Button variant="darkSuccess" className="relative" onClick={openInviteDialog}>
                  <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5">{selectedToWaitlist.length}</Badge>
                  <Handshake size={16} />
                  <span className="ml-1 max-xs:hidden">{t('common:invite')}</span>
                </Button>
              )}
              <Button variant="destructive" className="relative" onClick={openRemoveDialog}>
                <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5">{selected.length}</Badge>
                <Trash size={16} />
                <span className="ml-1 max-lg:hidden">{t('common:remove')}</span>
              </Button>
              <Button variant="ghost" onClick={clearSelection}>
                <XSquare size={16} />
                <span className="ml-1">{t('common:clear')}</span>
              </Button>
            </>
          )}
          {selected.length === 0 && <TableCount count={total} type="request" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
        </FilterBarActions>

        <div className="sm:grow" />

        <FilterBarContent>
          <TableSearch value={q} setQuery={onSearch} />
        </FilterBarContent>
      </TableFilterBar>

      {/* Columns view */}
      <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

      {/* Export */}
      <Export className="max-lg:hidden" filename={`${config.slug}-requests`} columns={columns} fetchRows={fetchExport} />

      {/* Focus view */}
      <FocusView iconOnly />
    </TableBarContainer>
  );
};
