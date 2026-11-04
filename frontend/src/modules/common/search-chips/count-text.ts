import type { TFunction } from 'i18next';
import type { ResultCount } from '~/modules/common/search-chips/types';

/** A counted noun, "5 members"; with `found`, what a search found: "5 members found", and "No members found" for none. */
export function countText(t: TFunction, { count, resource }: ResultCount, { found = false }: { found?: boolean } = {}) {
  if (found && count === 0) return t('c:no_resource_found', { resource: t(resource, { count: 2 }) });
  return t(found ? 'c:resource_count_found' : 'c:resource_count', { count, resource: t(resource, { count }) });
}
