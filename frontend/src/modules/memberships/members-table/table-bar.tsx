import { Mail, Trash, XSquare } from 'lucide-react';
import { motion } from 'motion/react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps, BaseTableMethods } from '~/modules/common/data-table/types';
import { FocusView } from '~/modules/common/focus-view';
import SelectRole from '~/modules/common/form-fields/select-role';
import type { MemberSearch, MembersTableProps } from '~/modules/memberships/members-table/table-wrapper';
import { MembershipInvitations } from '~/modules/memberships/pending-table/invites-count';
import type { Member } from '~/modules/memberships/types';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { nanoid } from '~/utils/nanoid';

type MembersTableBarProps = MembersTableProps &
  BaseTableMethods &
  BaseTableBarProps<Member, MemberSearch> & {
    role: MemberSearch['role'];
    openInviteDialog: (container: HTMLElement | null) => void;
    openDeleteDialog: () => void;
    fetchExport: (limit: number) => Promise<Member[]>;
  };

export const MembersTableBar = ({
  entity,
  total,
  selected,
  q,
  setSearch,
  role,
  columns,
  setColumns,
  isSheet = false,
  fetchExport,
  clearSelection,
  openInviteDialog,
  openDeleteDialog,
}: MembersTableBarProps) => {
  const { t } = useTranslation();
  const containerRef = useRef(null);

  const isFiltered = role !== undefined || !!q;
  const isAdmin = entity.membership?.role === 'admin';
  const entityType = entity.entity;

  // Drop selected Rows on search
  const onSearch = (searchString: string) => {
    clearSelection();
    setSearch({ q: searchString });
  };
  // Drop selected Rows on role change
  const onRoleChange = (role?: string) => {
    clearSelection();
    setSearch({ role: role === 'all' ? undefined : (role as MemberSearch['role']) });
  };

  const onResetFilters = () => {
    setSearch({ q: '', role: undefined });
    clearSelection();
  };

  return (
    <div>
      <TableBarContainer>
        {/* Table Filter Bar */}
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selected.length > 0 ? (
              <>
                <Button asChild variant="destructive" onClick={openDeleteDialog} className="relative">
                  <motion.button layout="size" layoutRoot transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                    <Badge context="button">{selected.length}</Badge>
                    <motion.span layoutId="members-filter-bar-icon">
                      <Trash size={16} />
                    </motion.span>

                    <span className="ml-1 max-xs:hidden">{entity.id ? t('common:remove') : t('common:delete')}</span>
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
              !isFiltered &&
              isAdmin && (
                //TODO mb rework sheet to find a way use dialog with ref in sheet
                <Button asChild onClick={() => openInviteDialog(isSheet ? null : containerRef.current)}>
                  <motion.button transition={{ duration: 0.1 }} layoutId={nanoid()} initial={false}>
                    <motion.span>
                      <Mail size={16} />
                    </motion.span>
                    <span className="ml-1">{t('common:invite')}</span>
                  </motion.button>
                </Button>
              )
            )}
            {selected.length === 0 && (
              <TableCount count={total} type="member" isFiltered={isFiltered} onResetFilters={onResetFilters}>
                {isAdmin && !isFiltered && <MembershipInvitations entity={entity} />}
              </TableCount>
            )}
          </FilterBarActions>
          <div className="sm:grow" />
          <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
            <TableSearch value={q} setQuery={onSearch} />
            <SelectRole entity value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" />
          </FilterBarContent>
        </TableFilterBar>

        {/* Columns view dropdown */}
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

        {/* Export */}
        {!isSheet && (
          <Export className="max-lg:hidden" filename={`${entityType} members`} columns={columns} selectedRows={selected} fetchRows={fetchExport} />
        )}

        {/* Focus view */}
        {!isSheet && <FocusView iconOnly />}
      </TableBarContainer>

      {/* Container ref to embed dialog */}
      <div className="empty:hidden" ref={containerRef} />
    </div>
  );
};
