import type { ContextEntityType } from 'shared';

export type EntityRouteEntry = {
  /** Route path template for this entity */
  path: string;
  /** Route param name this entity's slug fills (both as self and as ancestor) */
  paramName: string;
  /** Search params to apply when navigating to this entity's default route. */
  search?: Record<string, string>;
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
    path: '/$tenantId/$organizationSlug/organization/attachments',
    paramName: 'organizationSlug',
    search: { sort: 'createdAt', order: 'desc' },
  },
} as const satisfies Record<ContextEntityType, EntityRouteEntry>;
