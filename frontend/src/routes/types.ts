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
    /** Tab metadata for PageTabNav - if defined, this route will appear as a nav tab */
    navTab?: {
      id: string;
      label: string;
      /** Sort position among sibling tabs (default 0, lower first; ties keep route order) */
      order?: number;
      /** Grant this tab needs to be shown: hidden unless PageTabNav receives it via `grants`.
       *  Declarative so pages never hardcode sibling tab ids (which can't know fork tabs). */
      requires?: 'update';
    };
  }
}
