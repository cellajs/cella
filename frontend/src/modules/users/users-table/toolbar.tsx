import { Mail, Trash, XSquare } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { FocusView } from '~/modules/common/focus-view';
import SelectRole from '~/modules/common/form-fields/select-role';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import type { ContextEntity, Member, Role, User } from '~/types';
import ColumnsView, { type ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import TableCount from '../../common/data-table/table-count';

import { motion } from 'framer-motion';
import Export from '~/modules/common/data-table/export';
import type { queryOptions } from '.';

interface Props<T> {
  total?: number;
  query?: string;
  setQuery: (value?: string) => void;
  isFiltered?: boolean;
  role?: Role;
  entityType?: ContextEntity;
  setRole: React.Dispatch<React.SetStateAction<Role | undefined>>;
  selectedUsers: T[];
  onResetFilters: () => void;
  onResetSelectedRows?: () => void;
  columns: ColumnOrColumnGroup<T>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<T>[]>>;
  fetchForExport: ((limit: number) => Promise<queryOptions<T>>) | null;
  inviteDialog: () => void;
  removeDialog: () => void;
}

function Toolbar<T extends User | Member>({
  entityType,
  selectedUsers,
  isFiltered,
  total,
  role,
  setRole,
  onResetFilters,
  onResetSelectedRows,
  query,
  setQuery,
  columns,
  setColumns,
  inviteDialog,
  removeDialog,
  fetchForExport,
}: Props<T>) {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);

  const onRoleChange = (role?: string) => {
    setRole(role === 'all' ? undefined : (role as Role | undefined));
  };

  return (
    <>
      <div className={'flex items-center max-sm:justify-between md:gap-2'}>
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selectedUsers.length > 0 ? (
              <>
                <Button asChild variant="destructive" onClick={removeDialog} className="relative">
                  <motion.button layout="size" layoutRoot transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                    <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2 animate-in zoom-in">
                      {selectedUsers.length}
                    </Badge>
                    <motion.span layoutId="members-filter-bar-icon">
                      <Trash size={16} />
                    </motion.span>

                    <span className="ml-1 max-xs:hidden">{t('common:remove')}</span>
                  </motion.button>
                </Button>

                <Button asChild variant="ghost" onClick={onResetSelectedRows}>
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
            ) : (
              !isFiltered &&
              user.role === 'ADMIN' && (
                <Button asChild onClick={inviteDialog}>
                  <motion.button transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                    <motion.span layoutId="members-filter-bar-icon">
                      <Mail size={16} />
                    </motion.span>
                    <span className="ml-1">{t('common:invite')}</span>
                  </motion.button>
                </Button>
              )
            )}
            {selectedUsers.length === 0 && <TableCount count={total} type="member" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-top max-sm:fade-in max-sm:duration-300">
            <TableSearch value={query} setQuery={setQuery} />
            <SelectRole entityType={entityType} value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" />
          </FilterBarContent>
        </TableFilterBar>

        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

        {fetchForExport && (
          <Export
            className="max-lg:hidden"
            filename={entityType ? `${entityType} members` : 'Members'}
            columns={columns}
            selectedRows={selectedUsers}
            fetchRows={async (limit) => {
              const { items } = await fetchForExport(limit);
              return items;
            }}
          />
        )}

        <FocusView iconOnly />
      </div>
    </>
  );
}

export default Toolbar;
