import { useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { FilterBarContent } from '~/modules/common/data-table/table-filter-bar';

import TableSearch from '~/modules/common/data-table/table-search';
import SelectRole from '~/modules/common/form-fields/select-role';
import type { ContextEntity } from '~/types/common';
import type { MemberSearch } from '.';

const FilterBarSearch = ({
  entityType,
}: {
  entityType: ContextEntity;
}) => {
  const search = useSearch({ strict: false });

  // Table state
  const [q, setQuery] = useState<MemberSearch['q']>(search.q);
  const [role, setRole] = useState<MemberSearch['role']>(search.role as MemberSearch['role']);

  const onRoleChange = (role?: string) => {
    setRole(role === 'all' ? undefined : (role as MemberSearch['role']));
  };
  const filters = useMemo(() => ({ q, role }), [q, role]);
  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  useEffect(() => {
    if (search.role === role && search.q === q) return;
    if (search.role !== role) setRole(search.role as MemberSearch['role']);
    if (search.q !== q) setQuery(search.q);
  }, [search.q, search.role]);

  return (
    <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
      <TableSearch value={q} setQuery={setQuery} />
      <SelectRole entityType={entityType} value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" />
    </FilterBarContent>
  );
};

export default FilterBarSearch;
