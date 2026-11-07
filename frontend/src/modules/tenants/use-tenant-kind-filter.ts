import { useTranslation } from 'react-i18next';
import { type TenantKind, tenantKindValues } from 'shared';
import type { SearchFilters } from '~/modules/common/search-chips/types';

const isTenantKind = (value: string): value is TenantKind => tenantKindValues.some((kind) => kind === value);

interface TenantKindFilterOptions {
  /** The kinds picked; none reads as the kinds the app lists by default. */
  value: TenantKind[];
  onChange: (kinds: TenantKind[]) => void;
}

/** The tenant kind filter of a list across tenants, for its search field: several kinds widen each other. */
export function useTenantKindFilter({ value, onChange }: TenantKindFilterOptions): SearchFilters {
  const { t } = useTranslation();

  const toggle = (picked: string) => {
    if (!isTenantKind(picked)) return;
    onChange(value.includes(picked) ? value.filter((kind) => kind !== picked) : [...value, picked]);
  };

  const options = tenantKindValues.map((kind) => ({ value: kind, label: t(`c:${kind}`), isSelected: value.includes(kind) }));

  return {
    groups: [
      {
        key: 'kind',
        label: t('c:kind'),
        options,
        onToggle: toggle,
        onReplace: (from, to) => isTenantKind(to) && onChange(value.map((kind) => (kind === from ? to : kind))),
      },
    ],
    chips: value.map((kind) => ({ key: `kind-${kind}`, group: 'kind', value: kind, label: t(`c:${kind}`), onRemove: () => toggle(kind) })),
  };
}
