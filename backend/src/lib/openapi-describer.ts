import type { MiddlewareHandler } from 'hono';

export type MiddlewareTag = string;

/**
 * Descriptor for a middleware to aid OpenAPI description generation.
 */
export type MiddlewareDescriptor = {
  /** Unique name for the middleware */
  name: MiddlewareTag;

  /** The actual middleware handler function */
  middleware: MiddlewareHandler;

  /** Logical category of this middleware */
  category: 'auth' | 'rate-limit' | 'logging' | 'other';

  /**
   * Authentication or visibility level.
   * - `public` overrides all others
   * - `authenticated` marks routes requiring login
   */
  level?: 'authenticated' | 'public';

  /**
   * Scopes required if the middleware narrows access (e.g., system/org-level)
   */
  scopes?: string[];

  /**
   * Optional label shown in OpenAPI description.
   * Multiple labels will be joined with commas.
   */
  label?: string;
};

/** Registry for declared middleware descriptors */
const middlewareRegistry = new Map<MiddlewareHandler, MiddlewareDescriptor>();

/**
 * Register a middleware descriptor for OpenAPI doc enhancement.
 * Should be called once per middleware during bootstrap.
 */
export function registerMiddlewareDescription(descriptor: MiddlewareDescriptor) {
  middlewareRegistry.set(descriptor.middleware, descriptor);
}

/**
 * Retrieve the registered descriptor for a middleware.
 * Returns undefined if the middleware has not been registered.
 */
export function getMiddlewareDescriptor(middleware: MiddlewareHandler): MiddlewareDescriptor | undefined {
  return middlewareRegistry.get(middleware);
}

/**
 * Enhance an OpenAPI route description by prefixing it with security or metadata context
 * derived from known middleware in the route.
 *
 * @param original - Original route description
 * @param middlewares - Middleware handlers used in the route
 * @returns Description with metadata prefixes (auth, rate-limit, etc.)
 */
export function enhanceOpenAPIDescription(original: string | undefined, middlewares: MiddlewareHandler[]): string {
  const descriptors = middlewares.map((mw) => middlewareRegistry.get(mw)).filter((d): d is MiddlewareDescriptor => !!d);

  const sections: string[] = [];

  const authSection = formatAuthSection(descriptors.filter((d) => d.category === 'auth'));
  if (authSection) sections.push(authSection);

  const rateLimitSection = formatRateLimitSection(descriptors.filter((d) => d.category === 'rate-limit'));
  if (rateLimitSection) sections.push(rateLimitSection);

  // Add more sections here if needed (logging, etc.)

  const combinedSections = sections
    .filter(Boolean)
    .map((line) => `${line}  `) // add two spaces at line end
    .join('\n');
  const originalDesc = original?.trim() ?? '';

  if (combinedSections && originalDesc) {
    return `${combinedSections}\n\n${originalDesc}`.trim();
  }

  return (combinedSections || originalDesc).trim();
}

/**
 * Build the auth-related prefix section for OpenAPI description.
 */
function formatAuthSection(authDescriptors: MiddlewareDescriptor[]): string | null {
  if (authDescriptors.length === 0) return null;

  const level = getHighestAuthLevel(authDescriptors);
  const icon = getIcon('auth', level);

  const labels = authDescriptors
    .map((d) => d.label)
    .filter(Boolean)
    .join(', ');

  const scopes = Array.from(new Set(authDescriptors.flatMap((d) => d.scopes ?? [])));
  const scopeText = scopes.length > 0 ? ` (${scopes.join(', ')} access)` : '';

  if (!icon && !labels && !scopeText) return null;

  return `${icon ?? ''} ${labels}${scopeText}`.trim();
}

/**
 * Build the rate-limit-related prefix section for OpenAPI description.
 */
function formatRateLimitSection(rateLimitDescriptors: MiddlewareDescriptor[]): string | null {
  if (rateLimitDescriptors.length === 0) return null;

  const icon = getIcon('rate-limit');

  const labels = rateLimitDescriptors
    .map((d) => d.label)
    .filter(Boolean)
    .join(', ');

  return labels ? `${icon ?? ''} ${labels}`.trim() : null;
}

/**
 * Determine the most permissive auth level among all descriptors.
 * "public" wins over "authenticated".
 */
function getHighestAuthLevel(descriptors: MiddlewareDescriptor[]): 'authenticated' | 'public' | undefined {
  const levels = descriptors.map((d) => d.level);
  if (levels.includes('public')) return 'public';
  if (levels.includes('authenticated')) return 'authenticated';
  return undefined;
}

/**
 * Get icon based on category and level. Adds more safety/flexibility for future customization.
 *
 * @param category - Middleware category (e.g., 'auth', 'rate-limit')
 * @param level - Optional level for more specific icons (e.g., 'public' vs 'authenticated')
 */
function getIcon(
  category: MiddlewareDescriptor['category'],
  level?: MiddlewareDescriptor['level'],
): string | undefined {
  if (category === 'auth') {
    if (level === 'public') return '🌐';
    if (level === 'authenticated') return '🛡️';
    return '🛡️'; // Default for scoped-only auth
  }

  if (category === 'rate-limit') return '⏳'; // Placeholder for rate limit icon
  return undefined;
}

/**
 * OpenAPI specification extensions (x-*) for routes.
 */
export type SpecificationExtensions = {
  'x-auth': string[];
  'x-rate-limiter': string[];
};

/**
 * Returns OpenAPI specification extensions (x-*) based on the middlewares used in a route.
 *
 * @param middlewares - Middleware handlers used in the route
 * @returns Object with OpenAPI x-* extensions
 */
export function getSpecificationExtensions(middlewares: MiddlewareHandler[]): SpecificationExtensions {
  const descriptors = middlewares.map((mw) => middlewareRegistry.get(mw)).filter((d): d is MiddlewareDescriptor => !!d);

  const xAuthSections = descriptors.filter((d) => d.category === 'auth');
  const xRateLimitSections = descriptors.filter((d) => d.category === 'rate-limit');

  return {
    'x-auth': xAuthSections.map((d) => d.name),
    'x-rate-limiter': xRateLimitSections.map((d) => d.name),
  };
}
