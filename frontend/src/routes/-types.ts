import type { BoundaryType } from '~/lib/boundary';
import type { PlacementDescriptor, Slot } from '~/lib/placements';
import type { NavItemId } from '~/modules/navigation/types';

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** The layout this route stands up: an error or not-found notice below it reads the layouts still standing from the nearest one. */
    boundary?: BoundaryType;
    /** Where the home button of an error or not-found notice at or below this route leads; `/` without one. */
    errorHome?: string;
    /** Nav items floating on a phone in place of the bottom bar; `right` stays empty where a page floats its main action. */
    floatingNavButtons?: { right?: NavItemId; left?: NavItemId };
    /** Nav tab placement for PageTabNav: default order 0, lower first, ties keep route order. */
    navTab?: PlacementDescriptor;
    /** The placement surface this route's tab bar is: its tabs resolve against `appConfig.surfaces[tabsSlot]`. A tabbed layout route must declare it. */
    tabsSlot?: Slot;
  }
}
