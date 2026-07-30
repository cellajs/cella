import type { PlacementOverrides } from '~/lib/placements';

/**
 * App overrides for placement-driven sections and nav tabs, keyed by host (a slot id such as
 * 'organization.settings', or a parent route id such as '/_app/system'), then placement id.
 * Cella ships none; apps hide, reorder, or re-gate template defaults here without editing
 * template files, e.g. `{ '/_app/system': { requests: { hidden: true } } }`.
 */
export const placementOverrides: PlacementOverrides = {};
