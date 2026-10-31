import { useTranslation } from 'react-i18next';
import { appConfig, type ChannelEntityType, hierarchy } from 'shared';
import type { SearchFilters } from '~/modules/common/search-chips-field';

interface RoleSearchFilterOptions {
  /** Restrict options to this channel entity's role vocabulary; omit for system roles. */
  entityType?: ChannelEntityType;
  value?: string;
  /** No role selected reads and writes `undefined`. */
  onChange: (value?: string) => void;
}

/** A list's role filter for its search field. */
export function useRoleSearchFilter({ entityType, value, onChange }: RoleSearchFilterOptions): SearchFilters {
  const { t } = useTranslation();
  const roles = entityType ? hierarchy.getRoles(entityType) : appConfig.systemRoles;
  const options = roles.map((role) => ({ value: role, label: t(role), isSelected: role === value }));
  const selected = options.find((option) => option.isSelected);

  return {
    groups: [{ key: 'role', label: t('c:role'), options, onToggle: (role) => onChange(role === value ? undefined : role) }],
    chips: selected ? [{ key: 'role', label: selected.label, onRemove: () => onChange(undefined) }] : [],
  };
}
