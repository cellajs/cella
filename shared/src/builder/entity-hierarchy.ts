/**
 * Entity hierarchy builder with compile-time validation, parent inheritance, and public access config.
 *
 * Fork contract: Every tenant-scoped table must have tenant_id. Tables with an organization
 * parent must also have organization_id with a composite FK to organizations(tenant_id, id).
 * Parentless products require tenant_id only. canBePublic() determines hybrid vs standard RLS policies.
 */

export type PublicAction = 'read';

/** Context entities that can be set public. */
export interface PublicAccessSource {
  actions: readonly PublicAction[];
}

/** Entities inheriting public access from a parent context. */
export interface PublicAccessInherited {
  inherits: string;
  actions: readonly PublicAction[];
}

export type PublicAccessConfig = PublicAccessSource | PublicAccessInherited;

function isInheritedAccess(config: PublicAccessConfig): config is PublicAccessInherited {
  return 'inherits' in config;
}

// Role Registry
function buildRoleMap<T extends readonly string[]>(roleNames: T): { readonly [K in T[number]]: K } {
  return Object.fromEntries(roleNames.map((r) => [r, r])) as { readonly [K in T[number]]: K };
}

/** Create frozen role registry with type-safe role name access. */
// role = entityRole
export function createRoleRegistry<const T extends readonly string[]>(
  roleNames: T,
): { readonly all: T } & { readonly [K in T[number]]: K } {
  const registry = Object.assign({ all: roleNames }, buildRoleMap(roleNames));
  return Object.freeze(registry) as { readonly all: T } & { readonly [K in T[number]]: K };
}

export type RoleFromRegistry<R extends { all: readonly string[] }> = R['all'][number];

// Hierarchy Types

export type EntityKind = 'user' | 'context' | 'product';

interface UserEntry { kind: 'user' }
interface ContextEntry<R extends string = string> {
  kind: 'context';
  parent: string | null;
  roles: readonly R[];
  publicAccess?: PublicAccessSource;
}
interface ProductEntry {
  kind: 'product';
  parent: string | null;
  publicAccess?: PublicAccessConfig;
}
type EntityEntry = UserEntry | ContextEntry | ProductEntry;

export interface ContextEntityView<R extends string = string> {
  readonly kind: 'context';
  readonly parent: string | null;
  readonly roles: readonly R[];
  readonly publicAccess?: PublicAccessSource;
}

export interface ProductEntityView {
  readonly kind: 'product';
  readonly parent: string | null;
  readonly publicAccess?: PublicAccessConfig;
}

export interface UserEntityView { readonly kind: 'user' }

export type EntityView = UserEntityView | ContextEntityView | ProductEntityView;

// Hierarchy Builder

/** Builder for entity hierarchy. Chain calls to define entities, then call build(). */
export class EntityHierarchyBuilder<
  TRoles extends { all: readonly string[] },
  TContexts extends string = never,
  TProducts extends string = never,
  TParentlessProducts extends string = never,
> {
  private readonly entities = new Map<string, EntityEntry>();
  private readonly roles: TRoles;
  private hasUser = false;

  constructor(roles: TRoles) {
    this.roles = roles;
  }

  /** Add user entity (required, once). */
  user(): EntityHierarchyBuilder<TRoles, TContexts, TProducts, TParentlessProducts> {
    if (this.hasUser) throw new Error('EntityHierarchy: user() can only be called once');
    this.hasUser = true;
    this.entities.set('user', { kind: 'user' });
    return this;
  }

  /** Add a context entity with parent reference and roles. */
  context<N extends string>(
    name: N,
    options: { parent: TContexts | null; roles: readonly RoleFromRegistry<TRoles>[]; publicAccess?: PublicAccessSource },
  ): EntityHierarchyBuilder<TRoles, TContexts | N, TProducts, TParentlessProducts> {
    this.validateName(name);
    this.validateParent(name, options.parent, 'context');
    this.validateRoles(name, options.roles);
    this.entities.set(name, { kind: 'context', parent: options.parent, roles: options.roles, publicAccess: options.publicAccess });
    return this as EntityHierarchyBuilder<TRoles, TContexts | N, TProducts, TParentlessProducts>;
  }

  /** Add a product entity with parent reference. Products with parent: null tracked as TParentlessProducts. */
  product<N extends string>(
    name: N,
    options: { parent: null; publicAccess?: PublicAccessConfig },
  ): EntityHierarchyBuilder<TRoles, TContexts, TProducts | N, TParentlessProducts | N>;
  product<N extends string>(
    name: N,
    options: { parent: TContexts; publicAccess?: PublicAccessConfig },
  ): EntityHierarchyBuilder<TRoles, TContexts, TProducts | N, TParentlessProducts>;
  product(name: string, options: { parent: string | null; publicAccess?: PublicAccessConfig }) {
    this.validateName(name);
    this.validateParent(name, options.parent, 'product');
    this.validatePublicAccess(name, options.publicAccess);
    this.entities.set(name, { kind: 'product', parent: options.parent, publicAccess: options.publicAccess });
    return this;
  }

  /** Build and freeze the hierarchy. */
  build(): EntityHierarchy<TRoles, TContexts, TProducts, TParentlessProducts> {
    if (!this.hasUser) throw new Error('EntityHierarchy: user() must be called before build()');
    if (!this.entities.has('organization')) throw new Error('EntityHierarchy: organization context is required');
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

  private validatePublicAccess(name: string, publicAccess?: PublicAccessConfig): void {
    if (!publicAccess) return;

    // Validate inherited access references an existing entity
    if (isInheritedAccess(publicAccess)) {
      const sourceEntry = this.entities.get(publicAccess.inherits);
      if (!sourceEntry) {
        throw new Error(
          `EntityHierarchy: product "${name}" public access inherits from unknown entity "${publicAccess.inherits}". ` +
            'The source entity must be defined before the inheriting entity.',
        );
      }
      // Source must be a context entity with publicAccess configured
      if (sourceEntry.kind !== 'context') {
        throw new Error(
          `EntityHierarchy: product "${name}" public access inherits from "${publicAccess.inherits}", ` +
            `but it is a ${sourceEntry.kind} entity. Only context entities can be public access sources.`,
        );
      }
      if (!sourceEntry.publicAccess) {
        throw new Error(
          `EntityHierarchy: product "${name}" public access inherits from "${publicAccess.inherits}", ` +
            'but that context has no publicAccess configured.',
        );
      }
    }

    // Validate actions array is not empty
    if (publicAccess.actions.length === 0) {
      throw new Error(`EntityHierarchy: product "${name}" publicAccess must have at least one action`);
    }
  }
}

// Entity Hierarchy (Frozen Result)

/** Frozen entity hierarchy with query methods. Created by EntityHierarchyBuilder.build(). */
export class EntityHierarchy<
  TRoles extends { all: readonly string[] },
  TContexts extends string = string,
  TProducts extends string = string,
  TParentlessProducts extends string = string,
> {
  private readonly entities: ReadonlyMap<string, EntityEntry>;
  private readonly roleRegistry: TRoles;
  private readonly ancestorCache = new Map<string, readonly string[]>();
  private readonly childrenCache = new Map<string, readonly (TContexts | TProducts)[]>();
  private readonly descendantsCache = new Map<string, readonly (TContexts | TProducts)[]>();

  readonly contextTypes: readonly TContexts[];
  readonly productTypes: readonly TProducts[];
  readonly allTypes: readonly ('user' | TContexts | TProducts)[];
  readonly relatableContextTypes: readonly TContexts[];
  readonly parentlessProductTypes: readonly TParentlessProducts[];
  readonly publicAccessSourceTypes: readonly TContexts[];
  readonly publicAccessTypes: readonly (TContexts | TProducts)[];

  constructor(roles: TRoles, entities: Map<string, EntityEntry>) {
    this.roleRegistry = roles;
    this.entities = new Map(entities);

    // Single-pass computation of all type arrays
    const contexts: TContexts[] = [];
    const products: TProducts[] = [];
    const all: ('user' | TContexts | TProducts)[] = [];
    const parentlessProducts: TParentlessProducts[] = [];
    const relatableContexts = new Set<TContexts>();
    const publicSources: TContexts[] = [];
    const publicAccessTypes: (TContexts | TProducts)[] = [];

    for (const [name, entry] of entities) {
      all.push(name as 'user' | TContexts | TProducts);

      if (entry.kind === 'context') {
        contexts.push(name as TContexts);
        if (entry.publicAccess) {
          publicSources.push(name as TContexts);
          publicAccessTypes.push(name as TContexts);
        }
      } else if (entry.kind === 'product') {
        products.push(name as TProducts);
        if (entry.parent === null) {
          parentlessProducts.push(name as TParentlessProducts);
        } else {
          relatableContexts.add(entry.parent as TContexts);
        }
        if (entry.publicAccess) {
          publicAccessTypes.push(name as TProducts);
        }
      }
    }

    this.contextTypes = Object.freeze(contexts);
    this.productTypes = Object.freeze(products);
    this.allTypes = Object.freeze(all);
    this.parentlessProductTypes = Object.freeze(parentlessProducts);
    this.relatableContextTypes = Object.freeze([...relatableContexts]);
    this.publicAccessSourceTypes = Object.freeze(publicSources);
    this.publicAccessTypes = Object.freeze(publicAccessTypes);
    Object.freeze(this);
  }

  getKind(entityType: string): EntityKind | undefined {
    return this.entities.get(entityType)?.kind;
  }

  isContext(entityType: string): entityType is TContexts {
    return this.getKind(entityType) === 'context';
  }

  isProduct(entityType: string): entityType is TProducts {
    return this.getKind(entityType) === 'product';
  }

  /** Get roles for a context entity. Returns empty array for non-context. */
  getRoles(contextType: string): readonly RoleFromRegistry<TRoles>[] {
    const entry = this.entities.get(contextType);
    return entry?.kind === 'context' ? (entry.roles as readonly RoleFromRegistry<TRoles>[]) : [];
  }

  /** Get the direct parent (always a context entity). Returns null for root entities or user. */
  getParent(entityType: string): TContexts | null {
    const entry = this.entities.get(entityType);
    return entry && entry.kind !== 'user' ? (entry.parent as TContexts | null) : null;
  }

  /** Get ordered ancestors (most-specific → root). Example: task → ['project', 'organization'] */
  getOrderedAncestors(entityType: string): readonly TContexts[] {
    const cached = this.ancestorCache.get(entityType);
    if (cached) return cached as readonly TContexts[];

    const ancestors: TContexts[] = [];
    let current = this.getParent(entityType);
    while (current !== null) {
      const entry = this.entities.get(current);
      if (!entry) break;
      if (entry.kind === 'context') ancestors.push(current as TContexts);
      current = entry.kind === 'user' ? null : (entry.parent as TContexts | null);
    }

    const frozen = Object.freeze(ancestors);
    this.ancestorCache.set(entityType, frozen);
    return frozen;
  }

  /** Get entity view (kind + parent + roles if context). */
  getConfig(entityType: string): EntityView | undefined {
    const entry = this.entities.get(entityType);
    if (!entry) return undefined;
    if (entry.kind === 'user') return { kind: 'user' };
    if (entry.kind === 'context') {
      return { kind: 'context', parent: entry.parent, roles: entry.roles, publicAccess: entry.publicAccess };
    }
    return { kind: 'product', parent: entry.parent, publicAccess: entry.publicAccess };
  }

  /** Get product entity view. */
  getProductConfig(entityType: string): ProductEntityView | undefined {
    const config = this.getConfig(entityType);
    return config?.kind === 'product' ? config : undefined;
  }

  /** Get context entity view. */
  getContextConfig(entityType: string): ContextEntityView<RoleFromRegistry<TRoles>> | undefined {
    const config = this.getConfig(entityType);
    return config?.kind === 'context' ? (config as ContextEntityView<RoleFromRegistry<TRoles>>) : undefined;
  }

  hasAncestor(entityType: string, ancestor: string): boolean {
    return this.getOrderedAncestors(entityType).includes(ancestor as TContexts);
  }

  /** Get direct children. Cached. */
  getChildren(contextType: string): readonly (TContexts | TProducts)[] {
    const cached = this.childrenCache.get(contextType);
    if (cached) return cached;

    const children: (TContexts | TProducts)[] = [];
    for (const [name, entry] of this.entities) {
      if (entry.kind !== 'user' && entry.parent === contextType) {
        children.push(name as TContexts | TProducts);
      }
    }

    const frozen = Object.freeze(children);
    this.childrenCache.set(contextType, frozen);
    return frozen;
  }

  /** Get all descendants (breadth-first). Cached. */
  getOrderedDescendants(contextType: string): readonly (TContexts | TProducts)[] {
    const cached = this.descendantsCache.get(contextType);
    if (cached) return cached;

    const descendants: (TContexts | TProducts)[] = [];
    const queue = [...this.getChildren(contextType)];
    let i = 0;
    while (i < queue.length) {
      const current = queue[i++];
      descendants.push(current);
      if (this.isContext(current)) queue.push(...this.getChildren(current));
    }

    const frozen = Object.freeze(descendants);
    this.descendantsCache.set(contextType, frozen);
    return frozen;
  }

  get roles(): TRoles {
    return this.roleRegistry;
  }

  // Public Access Methods

  /** Get public access config. Returns undefined if not configured. */
  getPublicAccessConfig(entityType: string): PublicAccessConfig | undefined {
    const entry = this.entities.get(entityType);
    return entry && entry.kind !== 'user' ? entry.publicAccess : undefined;
  }

  /** Check if entity can be public (has publicAccess configured). */
  canBePublic(entityType: string): boolean {
    return this.getPublicAccessConfig(entityType) !== undefined;
  }

  /** Get allowed public actions. Returns empty array if not configured. */
  getPublicActions(entityType: string): readonly PublicAction[] {
    return this.getPublicAccessConfig(entityType)?.actions ?? [];
  }

  /** Get entity type from which public access is inherited. Returns null if source or none. */
  getPublicInheritanceSource(entityType: string): string | null {
    const config = this.getPublicAccessConfig(entityType);
    return config && isInheritedAccess(config) ? config.inherits : null;
  }

  /** Check if entity is a public access source (context with publicAccess). */
  publicGuardSource(entityType: string): boolean {
    return this.publicAccessSourceTypes.includes(entityType as TContexts);
  }
}

/** Create a new entity hierarchy builder with a role registry. */
export function createEntityHierarchy<R extends { all: readonly string[] }>(
  roles: R,
): EntityHierarchyBuilder<R, never, never, never> {
  return new EntityHierarchyBuilder(roles);
}


