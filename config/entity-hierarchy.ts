/**
 * Entity hierarchy builder with compile-time validation.
 *
 * Provides a fluent API to define entity relationships with:
 * - Single-parent inheritance (parent chain traversal for ordered ancestors)
 * - Typed role validation against a role registry
 * - Import-time validation of parent references
 * - Cached ordered ancestor computation
 */

/******************************************************************************
 * ROLE REGISTRY
 ******************************************************************************/

/**
 * Builds a map of role names to themselves for type-safe access.
 * Isolates the single unavoidable assertion for dynamic property creation.
 */
function buildRoleMap<T extends readonly string[]>(roleNames: T): { readonly [K in T[number]]: K } {
  return Object.fromEntries(roleNames.map((r) => [r, r])) as { readonly [K in T[number]]: K };
}

export function createRoleRegistry<const T extends readonly string[]>(
  roleNames: T,
): { readonly all: T } & { readonly [K in T[number]]: K } {
  // Object.assign merges the tuple with role map; assertion needed as
  // Object.freeze returns Readonly<T> which TS doesn't unify with our intersection
  const registry = Object.assign({ all: roleNames }, buildRoleMap(roleNames));
  return Object.freeze(registry) as { readonly all: T } & { readonly [K in T[number]]: K };
}

/** Type helper to extract role union from a role registry */
export type RoleFromRegistry<R extends { all: readonly string[] }> = R['all'][number];

/******************************************************************************
 * HIERARCHY TYPES
 ******************************************************************************/

/** Entity kinds in the system */
export type EntityKind = 'user' | 'context' | 'product';

/** Internal representation of user entity */
interface UserEntry {
  kind: 'user';
}

/** Internal representation of context entity */
interface ContextEntry<R extends string = string> {
  kind: 'context';
  parent: string | null;
  roles: readonly R[];
}

/** Internal representation of product entity */
interface ProductEntry {
  kind: 'product';
  parent: string | null;
}

type EntityEntry = UserEntry | ContextEntry | ProductEntry;

/** Public readonly view of a context entity config */
export interface ContextEntityView<R extends string = string> {
  readonly kind: 'context';
  readonly parent: string | null;
  readonly roles: readonly R[];
}

/** Public readonly view of a product entity config */
export interface ProductEntityView {
  readonly kind: 'product';
  readonly parent: string | null;
}

/** Public readonly view of user entity config */
export interface UserEntityView {
  readonly kind: 'user';
}

export type EntityView = UserEntityView | ContextEntityView | ProductEntityView;

/******************************************************************************
 * HIERARCHY BUILDER
 ******************************************************************************/

/**
 * Builder for entity hierarchy with validation.
 * Chain calls to define entities, then call build() to get the frozen hierarchy.
 */
export class EntityHierarchyBuilder<
  TRoles extends { all: readonly string[] },
  TContexts extends string = never,
  TProducts extends string = never,
> {
  private readonly entities = new Map<string, EntityEntry>();
  private readonly roles: TRoles;
  private hasUser = false;

  constructor(roles: TRoles) {
    this.roles = roles;
  }

  /**
   * Add the user entity (required, can only be called once).
   */
  user(): EntityHierarchyBuilder<TRoles, TContexts, TProducts> {
    if (this.hasUser) {
      throw new Error('EntityHierarchy: user() can only be called once');
    }
    this.hasUser = true;
    this.entities.set('user', { kind: 'user' });
    return this;
  }

  /**
   * Add a context entity with optional parent and required roles.
   *
   * @param name - Entity type name (e.g., 'organization', 'project')
   * @param options - Configuration with parent reference and roles array
   */
  context<N extends string>(
    name: N,
    options: {
      parent: TContexts | null;
      roles: readonly RoleFromRegistry<TRoles>[];
    },
  ): EntityHierarchyBuilder<TRoles, TContexts | N, TProducts> {
    this.validateName(name);
    this.validateParent(name, options.parent, 'context');
    this.validateRoles(name, options.roles);

    this.entities.set(name, {
      kind: 'context',
      parent: options.parent,
      roles: options.roles,
    });

    return this as EntityHierarchyBuilder<TRoles, TContexts | N, TProducts>;
  }

  /**
   * Add a product entity with optional parent.
   *
   * @param name - Entity type name (e.g., 'attachment', 'task')
   * @param options - Configuration with parent reference (context entity or null)
   */
  product<N extends string>(
    name: N,
    options: { parent: TContexts | null },
  ): EntityHierarchyBuilder<TRoles, TContexts, TProducts | N> {
    this.validateName(name);
    this.validateParent(name, options.parent, 'product');

    this.entities.set(name, {
      kind: 'product',
      parent: options.parent,
    });

    return this as EntityHierarchyBuilder<TRoles, TContexts, TProducts | N>;
  }

  /**
   * Build and freeze the hierarchy.
   * Returns an EntityHierarchy instance with query methods.
   */
  build(): EntityHierarchy<TRoles, TContexts, TProducts> {
    if (!this.hasUser) {
      throw new Error('EntityHierarchy: user() must be called before build()');
    }

    // Validate organization exists (required context)
    if (!this.entities.has('organization')) {
      throw new Error('EntityHierarchy: organization context is required');
    }

    return new EntityHierarchy(this.roles, this.entities);
  }

  private validateName(name: string): void {
    if (this.entities.has(name)) {
      throw new Error(`EntityHierarchy: entity "${name}" already defined`);
    }
    if (name === 'user') {
      throw new Error('EntityHierarchy: "user" is reserved, use user() method');
    }
  }

  private validateParent(name: string, parent: string | null, kind: 'context' | 'product'): void {
    if (parent === null) return;

    const parentEntry = this.entities.get(parent);
    if (!parentEntry) {
      throw new Error(
        `EntityHierarchy: ${kind} "${name}" references unknown parent "${parent}". ` +
          'Parents must be defined before children.',
      );
    }
    if (parentEntry.kind !== 'context') {
      throw new Error(
        `EntityHierarchy: ${kind} "${name}" parent "${parent}" must be a context entity, ` +
          `but it is a ${parentEntry.kind} entity.`,
      );
    }
  }

  private validateRoles(name: string, roles: readonly string[]): void {
    if (roles.length === 0) {
      throw new Error(`EntityHierarchy: context "${name}" must have at least one role`);
    }

    const validRoles = new Set(this.roles.all);
    for (const role of roles) {
      if (!validRoles.has(role)) {
        throw new Error(
          `EntityHierarchy: context "${name}" has invalid role "${role}". ` +
            `Valid roles: ${[...validRoles].join(', ')}`,
        );
      }
    }
  }
}

/******************************************************************************
 * ENTITY HIERARCHY (FROZEN RESULT)
 ******************************************************************************/

/**
 * Frozen entity hierarchy with query methods.
 * Created by EntityHierarchyBuilder.build().
 */
export class EntityHierarchy<
  TRoles extends { all: readonly string[] },
  TContexts extends string = string,
  TProducts extends string = string,
> {
  private readonly entities: ReadonlyMap<string, EntityEntry>;
  private readonly roleRegistry: TRoles;
  private readonly ancestorCache = new Map<string, readonly string[]>();
  private readonly childrenCache = new Map<string, readonly (TContexts | TProducts)[]>();
  private readonly descendantsCache = new Map<string, readonly (TContexts | TProducts)[]>();

  /** All context entity type names */
  readonly contextTypes: readonly TContexts[];
  /** All product entity type names */
  readonly productTypes: readonly TProducts[];
  /** All entity type names including 'user' */
  readonly allTypes: readonly ('user' | TContexts | TProducts)[];
  /** Context entities that are parents of product entities */
  readonly relatableContextTypes: readonly TContexts[];
  /** Product entities with no parent context (parent: null) - candidates for public access */
  readonly parentlessProductTypes: readonly TProducts[];

  constructor(roles: TRoles, entities: Map<string, EntityEntry>) {
    this.roleRegistry = roles;
    this.entities = new Map(entities);

    // Compute type arrays
    const contexts: TContexts[] = [];
    const products: TProducts[] = [];
    const all: ('user' | TContexts | TProducts)[] = [];

    for (const [name, entry] of entities) {
      all.push(name as 'user' | TContexts | TProducts);
      if (entry.kind === 'context') contexts.push(name as TContexts);
      if (entry.kind === 'product') products.push(name as TProducts);
    }

    this.contextTypes = Object.freeze(contexts);
    this.productTypes = Object.freeze(products);
    this.allTypes = Object.freeze(all);

    // Compute parentless product types (candidates for public access)
    const parentlessProducts = products.filter((p) => {
      const entry = entities.get(p);
      return entry?.kind === 'product' && entry.parent === null;
    });
    this.parentlessProductTypes = Object.freeze(parentlessProducts);

    // Compute relatable context types (context entities that are parents of products)
    const relatableContexts = new Set<TContexts>();
    for (const product of products) {
      const productEntry = entities.get(product);
      if (productEntry?.kind === 'product' && productEntry.parent) {
        const parentEntry = entities.get(productEntry.parent);
        if (parentEntry?.kind === 'context') {
          relatableContexts.add(productEntry.parent as TContexts);
        }
      }
    }
    this.relatableContextTypes = Object.freeze([...relatableContexts]);

    Object.freeze(this);
  }

  /**
   * Get the kind of an entity ('user', 'context', or 'product').
   */
  getKind(entityType: string): EntityKind | undefined {
    return this.entities.get(entityType)?.kind;
  }

  /**
   * Check if entity type is a context entity.
   */
  isContext(entityType: string): entityType is TContexts {
    return this.getKind(entityType) === 'context';
  }

  /**
   * Check if entity type is a product entity.
   */
  isProduct(entityType: string): entityType is TProducts {
    return this.getKind(entityType) === 'product';
  }

  /**
   * Get roles for a context entity.
   * Returns empty array for non-context entities.
   */
  getRoles(contextType: string): readonly RoleFromRegistry<TRoles>[] {
    const entry = this.entities.get(contextType);
    if (!entry || entry.kind !== 'context') return [];
    return entry.roles as readonly RoleFromRegistry<TRoles>[];
  }

  /**
   * Get the direct parent of an entity.
   * Returns null for root entities or user.
   */
  getParent(entityType: string): string | null {
    const entry = this.entities.get(entityType);
    if (!entry || entry.kind === 'user') return null;
    return entry.parent;
  }

  /**
   * Get ordered ancestors for an entity (most-specific → root).
   * Walks the parent chain and returns only context entities.
   *
   * @example
   * // Given: task → project → organization
   * hierarchy.getOrderedAncestors('task') // ['project', 'organization']
   */
  getOrderedAncestors(entityType: string): readonly TContexts[] {
    const cached = this.ancestorCache.get(entityType);
    if (cached) return cached as readonly TContexts[];

    const ancestors: TContexts[] = [];
    let current = this.getParent(entityType);

    while (current !== null) {
      const entry = this.entities.get(current);
      if (!entry) break;

      if (entry.kind === 'context') {
        ancestors.push(current as TContexts);
      }

      current = entry.kind === 'user' ? null : entry.parent;
    }

    const frozen = Object.freeze(ancestors);
    this.ancestorCache.set(entityType, frozen);
    return frozen;
  }

  /**
   * Get product entity view with parent info.
   * Returns undefined for non-product entities.
   */
  getProductConfig(entityType: string): ProductEntityView | undefined {
    const entry = this.entities.get(entityType);
    if (!entry || entry.kind !== 'product') return undefined;
    return { kind: 'product', parent: entry.parent };
  }

  /**
   * Get context entity view with parent and roles.
   * Returns undefined for non-context entities.
   */
  getContextConfig(entityType: string): ContextEntityView<RoleFromRegistry<TRoles>> | undefined {
    const entry = this.entities.get(entityType);
    if (!entry || entry.kind !== 'context') return undefined;
    return {
      kind: 'context',
      parent: entry.parent,
      roles: entry.roles as readonly RoleFromRegistry<TRoles>[],
    };
  }

  /**
   * Get entity view (kind + parent + roles if context).
   */
  getConfig(entityType: string): EntityView | undefined {
    const entry = this.entities.get(entityType);
    if (!entry) return undefined;

    if (entry.kind === 'user') return { kind: 'user' };
    if (entry.kind === 'context') {
      return { kind: 'context', parent: entry.parent, roles: entry.roles };
    }
    return { kind: 'product', parent: entry.parent };
  }

  /**
   * Check if an entity has a specific ancestor in its chain.
   */
  hasAncestor(entityType: string, ancestor: string): boolean {
    return this.getOrderedAncestors(entityType).includes(ancestor as TContexts);
  }

  /**
   * Get direct children of a context entity (entities where parent === contextType).
   * Returns both context and product entities. Cached for performance.
   *
   * @example
   * // Given: organization → project, organization → attachment
   * hierarchy.getChildren('organization') // ['project', 'attachment']
   */
  getChildren(contextType: string): readonly (TContexts | TProducts)[] {
    const cached = this.childrenCache.get(contextType);
    if (cached) return cached;

    const children: (TContexts | TProducts)[] = [];
    for (const [name, entry] of this.entities) {
      if (entry.kind === 'user') continue;
      if (entry.parent === contextType) {
        children.push(name as TContexts | TProducts);
      }
    }

    const frozen = Object.freeze(children);
    this.childrenCache.set(contextType, frozen);
    return frozen;
  }

  /**
   * Get all descendants of a context entity (breadth-first traversal).
   * Returns entities level by level: direct children first, then grandchildren, etc.
   * Cached for performance.
   *
   * @example
   * // Given: organization → project → task, organization → attachment
   * hierarchy.getOrderedDescendants('organization') // ['project', 'attachment', 'task']
   */
  getOrderedDescendants(contextType: string): readonly (TContexts | TProducts)[] {
    const cached = this.descendantsCache.get(contextType);
    if (cached) return cached;

    const descendants: (TContexts | TProducts)[] = [];
    const queue = [...this.getChildren(contextType)];
    let index = 0;

    while (index < queue.length) {
      const current = queue[index++];
      descendants.push(current);
      // Only context entities can have children
      if (this.isContext(current)) {
        queue.push(...this.getChildren(current));
      }
    }

    const frozen = Object.freeze(descendants);
    this.descendantsCache.set(contextType, frozen);
    return frozen;
  }

  /**
   * Get the role registry.
   */
  get roles(): TRoles {
    return this.roleRegistry;
  }
}

/******************************************************************************
 * FACTORY FUNCTION
 ******************************************************************************/

/**
 * Create a new entity hierarchy builder with a role registry.
 *
 * @example
 * const roles = createRoleRegistry(['admin', 'member'] as const);
 * const hierarchy = createEntityHierarchy(roles)
 *   .user()
 *   .context('organization', { parent: null, roles: roles.all })
 *   .product('attachment', { parent: 'organization' })
 *   .build();
 */
export function createEntityHierarchy<R extends { all: readonly string[] }>(
  roles: R,
): EntityHierarchyBuilder<R, never, never> {
  return new EntityHierarchyBuilder(roles);
}

/******************************************************************************
 * PUBLIC ENTITY VALIDATION
 ******************************************************************************/

/**
 * Validates that all product entities with parent: null are explicitly declared in publicProductEntityTypes.
 * This provides security-by-design: public entities must be intentionally configured.
 *
 * Call this at app startup (e.g., in server initialization) to catch misconfigurations early.
 *
 * @param hierarchy - The built entity hierarchy
 * @param publicProductEntityTypes - Explicitly declared public product entity types from config
 * @throws Error if any parentless product entity is not in publicProductEntityTypes, or vice versa
 */
export function validatePublicProductEntities<T extends string>(
  hierarchy: EntityHierarchy<{ all: readonly string[] }, string, T>,
  publicProductEntityTypes: readonly string[],
): void {
  const parentlessFromHierarchy = new Set<string>(hierarchy.parentlessProductTypes);
  const declaredPublic = new Set(publicProductEntityTypes);

  // Check for parentless products not declared as public (security risk if unintentional)
  const undeclaredPublic = [...parentlessFromHierarchy].filter((t) => !declaredPublic.has(t));
  if (undeclaredPublic.length > 0) {
    throw new Error(
      `EntityHierarchy: Product entities with parent: null must be declared in publicProductEntityTypes. ` +
        `Missing: ${undeclaredPublic.join(', ')}. ` +
        `Either add them to publicProductEntityTypes or set a parent context for these entities.`,
    );
  }

  // Check for declared public types that actually have a parent (misconfiguration)
  const invalidPublic = [...declaredPublic].filter((t) => !parentlessFromHierarchy.has(t));
  if (invalidPublic.length > 0) {
    throw new Error(
      `EntityHierarchy: publicProductEntityTypes contains entities with a parent context. ` +
        `Invalid: ${invalidPublic.join(', ')}. ` +
        `Public product entities must have parent: null in the hierarchy.`,
    );
  }
}

/**
 * Check if a product entity type is a public entity (no parent context).
 * Utility for runtime checks in handlers and middleware.
 */
export function isPublicProductEntity<T extends string>(
  hierarchy: EntityHierarchy<{ all: readonly string[] }, string, T>,
  entityType: string,
): boolean {
  return hierarchy.parentlessProductTypes.includes(entityType as T);
}
