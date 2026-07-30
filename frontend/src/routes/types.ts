import type { PlacementDescriptor, Slot } from '~/lib/placements';
import type { NavItemId } from '~/modules/navigation/types';

/** Boundary type for top-level layout routes. */
export type BoundaryType = 'root' | 'app' | 'public';

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    boundary?: BoundaryType;
    isAuth: boolean;
    floatingNavButtons?: {
      right?: NavItemId;
      left?: NavItemId;
    };
    /**
     * Tab placement for PageTabNav: a child route declaring this appears as a nav tab (default
     * order 0, lower first; ties keep route order). `requires` names a grant the hosting page
     * passes via `grants`, declarative so pages never hardcode sibling tab ids (which cannot
     * know app tabs).
     */
    navTab?: PlacementDescriptor;
    /**
     * Marks a layout route as a tabbed surface bound to this slot. `resolveNavTabs` then merges
     * the slot's registry tab tools (routed through the surface's `$tool` host child) with the
     * route-file tabs, and keys app overrides plus channel arrangement by this slot id. Absent =
     * a route-file-only tab bar keyed by the parent route id (no registry or 3rd-party tabs).
     */
    tabsSlot?: Slot;
  }
}
