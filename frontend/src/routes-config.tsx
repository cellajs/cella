import type { ContextEntityType } from 'shared';

type EntityRouteEntry = {
  /** Route path template for this entity */
  path: string;
  /** Route param name this entity's slug fills (both as self and as ancestor) */
  paramName: string;
  /** When shown as subitem, navigate to a parent entity's route instead */
  subitemOf?: { entityType: ContextEntityType; searchParam: string };
};

/**
 * Unified route config for context entities.
 *
 * Each entity declares its route path, its param name, and optional subitem behavior.
 * The param name is used both when the entity is the target AND when it appears as an
 * ancestor in another entity's route.
 */
export const entityRouteConfig = {
  organization: {
    path: '/$tenantId/$organizationSlug/organization',
    paramName: 'organizationSlug',
  },
} as const satisfies Record<ContextEntityType, EntityRouteEntry>;

/** Legacy alias retained for backwards compatibility — prefer `entityRouteConfig`. */
export const baseEntityRoutes = {
  organization: entityRouteConfig.organization.path,
} as const;

/** Map entity types to their route param names. */
export const routeParamMap: Record<string, string> = {
  organization: entityRouteConfig.organization.paramName,
};
