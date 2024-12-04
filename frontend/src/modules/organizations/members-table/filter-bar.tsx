import { useSearch } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import { Mail, Trash, XSquare } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import SelectRole from '~/modules/common/form-fields/select-role';
import type { MemberSearch } from '~/modules/organizations/members-table';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import type { EntityPage, MinimumMembershipInfo } from '~/types/common';

const MembersTableFilterBar = ({
  entity,
  clearSelection,
  openInviteDialog,
  openRemoveDialog,
}: {
  entity: EntityPage & { membership: MinimumMembershipInfo | null };
  clearSelection: () => void;
  openInviteDialog: () => void;
  openRemoveDialog: () => void;
}) => {
  const { t } = useTranslation();
  const search = useSearch({ strict: false });

  const [selected, setSelected] = useState(0);
  const [total, setTotal] = useState(0);

  // Table state
  const [q, setQuery] = useState<MemberSearch['q']>(search.q);
  const [role, setRole] = useState<MemberSearch['role']>(search.role as MemberSearch['role']);

  const isFiltered = role !== undefined || !!q;

  const isAdmin = entity.membership?.role === 'admin';
  const entityType = entity.entity;

  const onRoleChange = (role?: string) => {
    setRole(role === 'all' ? undefined : (role as MemberSearch['role']));
  };

  const onResetFilters = () => {
    setQuery('');
    clearSelection();
    setRole(undefined);
  };

  const filters = useMemo(() => ({ q, role }), [q, role]);
  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });
  useEffect(() => {
    const table = document.getElementById(`members-table-${entity.id}`);
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
  }, [entity.id]);

  return (
    <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
      <FilterBarActions>
        {selected > 0 ? (
          <>
            <Button asChild variant="destructive" onClick={openRemoveDialog} className="relative">
              <motion.button layout="size" layoutRoot transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5 animate-in zoom-in">{selected}</Badge>
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
            <Button asChild onClick={openInviteDialog}>
              <motion.button transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                <motion.span layoutId="members-filter-bar-icon">
                  <Mail size={16} />
                </motion.span>
                <span className="ml-1">{t('common:invite')}</span>
              </motion.button>
            </Button>
          )
        )}
        {selected === 0 && <TableCount count={total} type="member" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
      </FilterBarActions>
      <div className="sm:grow" />
      <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
        <TableSearch value={q} setQuery={setQuery} />
        <SelectRole entityType={entityType} value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" />
      </FilterBarContent>
    </TableFilterBar>
  );
};
export default MembersTableFilterBar;
