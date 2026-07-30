import type { PlacementTab } from '~/lib/placements';
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
    navTab?: PlacementTab;
  }
}
