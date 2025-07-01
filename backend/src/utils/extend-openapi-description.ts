import type { MiddlewareHandler } from 'hono';
import { hasOrgAccess } from '#/middlewares/guard/has-org-access';
import { hasSystemAccess } from '#/middlewares/guard/has-system-access';
import { isAuthenticated } from '#/middlewares/guard/is-authenticated';
import { isPublicAccess } from '#/middlewares/guard/is-public-access';
import { isSystemAdmin } from '#/middlewares/guard/is-system-admin';

/**
 * String identifiers representing known middleware tags used in OpenAPI extension logic.
 */
type MiddlewareTag = 'isAuthenticated' | 'isPublicAccess' | 'hasOrgAccess' | 'hasSystemAccess' | 'isSystemAdmin';

/**
 * Describes a rule that can match a set of middleware tags and return a description string.
 */
type AuthRule = {
  /**
   * Returns `true` if this rule applies given the middleware tags.
   * @param tags - A set of collected middleware tags for the current route.
   */
  match: (tags: Set<MiddlewareTag>) => boolean;

  /**
   * Returns the description string for OpenAPI, based on the matched tags.
   * @param tags - A set of middleware tags. Optional use inside description.
   */
  describe: (tags: Set<MiddlewareTag>) => string;
};

/**
 * Descriptions for known middleware types, used as building blocks for OpenAPI doc generation.
 */
const MiddlewareDescriptions: Record<MiddlewareTag, string> = {
  isAuthenticated: '🛡️ Requires authentication.',
  isPublicAccess: '🌐 Public access.',
  hasOrgAccess: '',
  hasSystemAccess: '',
  isSystemAdmin: '🛡️ Requires authentication (system admin privileges).',
};

/**
 * Maps specific middleware functions to their logical tag identifiers.
 * This enables fast lookup for determining authentication rules.
 */
const MiddlewareTagMap = new Map<MiddlewareHandler, MiddlewareTag>([
  [isAuthenticated, 'isAuthenticated'],
  [isPublicAccess, 'isPublicAccess'],
  [hasOrgAccess, 'hasOrgAccess'],
  [hasSystemAccess, 'hasSystemAccess'],
  [isSystemAdmin, 'isSystemAdmin'],
]);

/**
 * Ordered list of rules that define how to describe a route based on the presence of middleware tags.
 */
const AuthRules: AuthRule[] = [
  {
    match: (tags) => tags.has('isPublicAccess'),
    describe: () => MiddlewareDescriptions.isPublicAccess,
  },
  {
    match: (tags) => tags.has('isSystemAdmin'),
    describe: () => MiddlewareDescriptions.isSystemAdmin,
  },
  {
    match: (tags) => tags.has('isAuthenticated'),
    describe: (tags) => {
      const scopes = [];
      if (tags.has('hasSystemAccess')) scopes.push('system');
      if (tags.has('hasOrgAccess')) scopes.push('organization');

      return scopes.length > 0 ? `🛡️ Requires authentication (${scopes.join(', ')} access).` : MiddlewareDescriptions.isAuthenticated;
    },
  },
];

/**
 * Enhances the OpenAPI route description based on authentication and access control middleware.
 *
 * This function inspects the middleware stack of a route, identifies known authentication-related middleware,
 * and prepends an appropriate security-related description to the route's original OpenAPI description.
 *
 * Supported middleware includes:
 * - `isAuthenticated`
 * - `isPublicAccess`
 * - `hasOrgAccess`
 * - `hasSystemAccess`
 * - `isSystemAdmin`
 *
 * If no matching middleware is found, the original description is returned unchanged.
 *
 * @param original - The original OpenAPI description string.
 * @param middlewares - An array of middleware handlers to inspect.
 * @returns The enhanced OpenAPI description string with authentication context.
 */
export function extendOpenAPIDescription(original: string | undefined, middlewares: MiddlewareHandler[]): string {
  const tags = new Set<MiddlewareTag>();

  for (const mw of middlewares) {
    const tag = MiddlewareTagMap.get(mw);
    if (tag) tags.add(tag);
  }

  const rule = AuthRules.find((r) => r.match(tags));
  const authLine = rule ? rule.describe(tags) : '';

  return authLine ? `${authLine}\n\n${original?.trim() ?? ''}`.trim() : (original?.trim() ?? '');
}
