import { config } from 'config';
import { Mailbox, Trash, XSquare } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

import { getRequests } from '~/api/requests';
import ColumnsView, { type ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { FocusView } from '~/modules/common/focus-view';
import { sheet } from '~/modules/common/sheeter/state';
import NewsletterForm from '~/modules/system/newsletter-form';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import type { Request } from '~/types';
import type { RequestsSearch } from '.';

interface Props {
  total?: number;
  query?: string;
  selectedRequests: Request[];
  setQuery: (value?: string) => void;
  isFiltered?: boolean;
  onResetFilters: () => void;
  onResetSelectedRows?: () => void;
  columns: ColumnOrColumnGroup<Request>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<Request>[]>>;
  sort: RequestsSearch['sort'];
  order: RequestsSearch['order'];
}

function Toolbar({
  total,
  isFiltered,
  query,
  setQuery,
  onResetFilters,
  onResetSelectedRows,
  columns,
  setColumns,
  selectedRequests,
  sort,
  order,
}: Props) {
  const { t } = useTranslation();

  const openDeleteDialog = () => {
    console.log('decline requests');
  };

  const openNewsletterSheet = () => {
    sheet(<NewsletterForm sheet />, {
      className: 'sm:max-w-[52rem]',
      title: t('common:newsletter'),
      text: t('common:newsletter.text'),
      id: 'newsletter-form',
    });
  };

  return (
    <>
      <div className={'flex items-center max-sm:justify-between md:gap-2'}>
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selectedRequests.length > 0 && (
              <>
                <Button onClick={openNewsletterSheet} className="relative">
                  <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedRequests.length}</Badge>
                  <Mailbox size={16} />
                  <span className="ml-1 max-xs:hidden">{t('common:newsletter')}</span>
                </Button>
                <Button variant="destructive" className="relative" onClick={openDeleteDialog}>
                  <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedRequests.length}</Badge>
                  <Trash size={16} />
                  <span className="ml-1 max-lg:hidden">{t('common:decline_request')}</span>
                </Button>
                <Button variant="ghost" onClick={onResetSelectedRows}>
                  <XSquare size={16} />
                  <span className="ml-1">{t('common:clear')}</span>
                </Button>
              </>
            )}
            {selectedRequests.length === 0 && <TableCount count={total} type="request" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent>
            <TableSearch value={query} setQuery={setQuery} />
          </FilterBarContent>
        </TableFilterBar>
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
        <Export
          className="max-lg:hidden"
          filename={`${config.slug}-requests`}
          columns={columns}
          selectedRows={selectedRequests}
          fetchRows={async (limit) => {
            const { items } = await getRequests({ limit, q: query, sort, order });
            return items;
          }}
        />
        <FocusView iconOnly />
      </div>
    </>
  );
}

export default Toolbar;
