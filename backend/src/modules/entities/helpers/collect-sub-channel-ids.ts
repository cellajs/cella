/**
 * Collect sub-context IDs (e.g. projectId) from memberships, grouped by org.
 * Used by catchup to identify which context counters to query.
 */

import { appConfig, hierarchy } from 'shared';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

export function collectSubChannelIds(memberships: MembershipBaseModel[]) {
  const rootChannelType = hierarchy.channelTypes.find((t) => hierarchy.getParent(t) === null)!;
  const byOrg = new Map<string, Set<string>>();
  const all = new Set<string>();

  for (const m of memberships) {
    for (const channelType of appConfig.channelEntityTypes) {
      if (channelType === rootChannelType) continue;
      const idKey = appConfig.entityIdColumnKeys[channelType];
      const value = (m as Record<string, unknown>)[idKey];
      if (typeof value === 'string') {
        let set = byOrg.get(m.organizationId);
        if (!set) {
          set = new Set();
          byOrg.set(m.organizationId, set);
        }
        set.add(value);
        all.add(value);
      }
    }
  }

  return { byOrg, all };
}
