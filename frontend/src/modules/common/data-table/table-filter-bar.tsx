import { Filter } from 'lucide-react';
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react';
import { Button } from '~/modules/ui/button';
import TableSearch from './table-search';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { cn } from '~/lib/utils';
import type { GetMembersParams } from '~/api/organizations';
import { useTranslation } from 'react-i18next';
import type { GetUsersParams } from '~/api/users';

interface Item {
  key: string;
  value: string;
}
interface Props {
  total?: number;
  width: number;
  items: Item[];
  query?: string;
  setQuery: (value?: string) => void;
  setParentFilter: Dispatch<SetStateAction<boolean>>;
  role: string | undefined;
  isFiltered?: boolean;
  setRole: React.Dispatch<React.SetStateAction<GetMembersParams['role']>> | React.Dispatch<React.SetStateAction<GetUsersParams['role']>>;
  onResetFilters?: () => void;
  onResetSelectedRows?: () => void;
}

const TableFilterBar = ({ items, role, query, width, setQuery, onResetFilters, setRole, setParentFilter }: Props) => {
  const { t } = useTranslation();

  const [isFilterOpen, setFilterOpen] = useState<boolean>(role !== undefined || query !== undefined ? true : false);
  const [isButtonClicked, setButtonClicked] = useState<boolean>(role !== undefined || query !== undefined ? true : false);

  const onShowFilterClick = () => {
    setButtonClicked(true);
    setFilterOpen(true);
    setParentFilter(true);
  };

  const onFiltersHideClick = () => {
    setButtonClicked(false);
    setFilterOpen(false);
    setParentFilter(false);
    if (onResetFilters) onResetFilters();
  };

  const crossButton = useMemo(() => {
    if (width < 640 && isFilterOpen) return <Button onClick={onFiltersHideClick}>X</Button>;
  }, [isFilterOpen, width]);

  const filters = useMemo(() => {
    if (!isFilterOpen)
      return (
        <Button className="mt-0" onClick={onShowFilterClick}>
          <Filter width={16} height={16} />
          <span className="ml-1">Filter</span>
        </Button>
      );
    return (
      <>
        <TableSearch query={query} setQuery={setQuery} />
        <Select
          value={role === undefined ? 'all' : role}
          onValueChange={(role) => {
            (setRole as React.Dispatch<React.SetStateAction<string | undefined>>)(role === 'all' ? undefined : role);
          }}
        >
          <SelectTrigger className={cn('h-10 w-[125px]', role !== undefined && 'text-primary')}>
            <SelectValue placeholder={t('common:placeholder.select_role')} />
          </SelectTrigger>
          <SelectContent>
            {items.map(({ key, value }) => (
              <SelectItem key={key} value={key}>
                {t(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </>
    );
  }, [isFilterOpen, query, role]);

  useEffect(() => {
    (() => {
      if (width >= 640 && !isFilterOpen) {
        setFilterOpen(true);
        return;
      }
      if (width < 640 && !isButtonClicked && isFilterOpen) {
        setFilterOpen(false);
        return;
      }
    })();
  }, [width]);

  return (
    <>
      {filters}
      {crossButton}
    </>
  );
};

export default TableFilterBar;
