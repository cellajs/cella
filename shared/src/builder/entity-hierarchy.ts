/**
 * Entity hierarchy builder with compile-time validation, parent inheritance, and public actions config.
 *
 * Fork contract: Every tenant-scoped table must have tenant_id. Tables with an organization
 * parent must also have organization_id with a composite FK to organizations(tenant_id, id).
 * Parentless products require tenant_id only. canBePublic() determines hybrid vs standard RLS policies.
 */

export type PublicAction = 'read';

/** Simple list of allowed public actions for an entity type. */
export type PublicActionsConfig = readonly PublicAction[];

/** Inherited public actions from a parent context. */
export interface PublicActionsInherited {
  inherits: string;
  actions: readonly PublicAction[];
}

/** Full public actions config: either a simple list or inherited from a context. */
export type PublicActionsOption = PublicActionsConfig | PublicActionsInherited;

function isInheritedActions(config: PublicActionsOption): config is PublicActionsInherited {
  return !Array.isArray(config) && 'inherits' in config;
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
  publicActions?: PublicActionsConfig;
}
interface ProductEntry {
  kind: 'product';
  parent: string | null;
  publicActions?: PublicActionsOption;
}
type EntityEntry = UserEntry | ContextEntry | ProductEntry;

export interface ContextEntityView<R extends string = string> {
  readonly kind: 'context';
  readonly parent: string | null;
  readonly roles: readonly R[];
  readonly publicActions?: PublicActionsConfig;
}

export interface ProductEntityView {
  readonly kind: 'product';
  readonly parent: string | null;
  readonly publicActions?: PublicActionsOption;
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
    options: { parent: TContexts | null; roles: readonly RoleFromRegistry<TRoles>[]; publicActions?: PublicActionsConfig },
  ): EntityHierarchyBuilder<TRoles, TContexts | N, TProducts, TParentlessProducts> {
    this.validateName(name);
    this.validateParent(name, options.parent, 'context');
    this.validateRoles(name, options.roles);
    this.entities.set(name, { kind: 'context', parent: options.parent, roles: options.roles, publicActions: options.publicActions });
    return this as EntityHierarchyBuilder<TRoles, TContexts | N, TProducts, TParentlessProducts>;
  }

  /** Add a product entity with parent reference. Products with parent: null tracked as TParentlessProducts. */
  product<N extends string>(
    name: N,
    options: { parent: null; publicActions?: PublicActionsOption },
  ): EntityHierarchyBuilder<TRoles, TContexts, TProducts | N, TParentlessProducts | N>;
  product<N extends string>(
    name: N,
    options: { parent: TContexts; publicActions?: PublicActionsOption },
  ): EntityHierarchyBuilder<TRoles, TContexts, TProducts | N, TParentlessProducts>;
  product(name: string, options: { parent: string | null; publicActions?: PublicActionsOption }) {
    this.validateName(name);
    this.validateParent(name, options.parent, 'product');
    this.validatePublicActions(name, options.publicActions);
    this.entities.set(name, { kind: 'product', parent: options.parent, publicActions: options.publicActions });
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

  private validatePublicActions(name: string, publicActions?: PublicActionsOption): void {
    if (!publicActions) return;

    // Validate inherited access references an existing entity
    if (isInheritedActions(publicActions)) {
      const sourceEntry = this.entities.get(publicActions.inherits);
      if (!sourceEntry) {
        throw new Error(
          `EntityHierarchy: product "${name}" publicActions inherits from unknown entity "${publicActions.inherits}". ` +
            'The source entity must be defined before the inheriting entity.',
        );
      }
      // Source must be a context entity with publicActions configured
      if (sourceEntry.kind !== 'context') {
        throw new Error(
          `EntityHierarchy: product "${name}" publicActions inherits from "${publicActions.inherits}", ` +
            `but it is a ${sourceEntry.kind} entity. Only context entities can be publicActions sources.`,
        );
      }
      if (!sourceEntry.publicActions) {
        throw new Error(
          `EntityHierarchy: product "${name}" publicActions inherits from "${publicActions.inherits}", ` +
            'but that context has no publicActions configured.',
        );
      }
    }

    // Validate actions array is not empty
    const actions = isInheritedActions(publicActions) ? publicActions.actions : publicActions;
    if (actions.length === 0) {
      throw new Error(`EntityHierarchy: product "${name}" publicActions must have at least one action`);
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
  readonly publicActionsSourceTypes: readonly TContexts[];
  readonly publicActionsTypes: readonly (TContexts | TProducts)[];

  /** @deprecated Use publicActionsTypes */
  get publicAccessTypes(): readonly (TContexts | TProducts)[] {
    return this.publicActionsTypes;
  }
  /** @deprecated Use publicActionsSourceTypes */
  get publicAccessSourceTypes(): readonly TContexts[] {
    return this.publicActionsSourceTypes;
  }

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
    const publicActionsTypes: (TContexts | TProducts)[] = [];

    for (const [name, entry] of entities) {
      all.push(name as 'user' | TContexts | TProducts);

      if (entry.kind === 'context') {
        contexts.push(name as TContexts);
        if (entry.publicActions) {
          publicSources.push(name as TContexts);
          publicActionsTypes.push(name as TContexts);
        }
      } else if (entry.kind === 'product') {
        products.push(name as TProducts);
        if (entry.parent === null) {
          parentlessProducts.push(name as TParentlessProducts);
        } else {
          relatableContexts.add(entry.parent as TContexts);
        }
        if (entry.publicActions) {
          publicActionsTypes.push(name as TProducts);
        }
      }
    }

    this.contextTypes = Object.freeze(contexts);
    this.productTypes = Object.freeze(products);
    this.allTypes = Object.freeze(all);
    this.parentlessProductTypes = Object.freeze(parentlessProducts);
    this.relatableContextTypes = Object.freeze([...relatableContexts]);
    this.publicActionsSourceTypes = Object.freeze(publicSources);
    this.publicActionsTypes = Object.freeze(publicActionsTypes);
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
      return { kind: 'context', parent: entry.parent, roles: entry.roles, publicActions: entry.publicActions };
    }
    return { kind: 'product', parent: entry.parent, publicActions: entry.publicActions };
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

  // Public Actions Methods

  /** Get public actions config. Returns undefined if not configured. */
  getPublicActionsConfig(entityType: string): PublicActionsOption | undefined {
    const entry = this.entities.get(entityType);
    return entry && entry.kind !== 'user' ? entry.publicActions : undefined;
  }

  /** @deprecated Use getPublicActionsConfig */
  getPublicAccessConfig(entityType: string): PublicActionsOption | undefined {
    return this.getPublicActionsConfig(entityType);
  }

  /** Check if entity type has public actions configured. */
  canBePublic(entityType: string): boolean {
    return this.getPublicActionsConfig(entityType) !== undefined;
  }

  /** Get allowed public actions. Returns empty array if not configured. */
  getPublicActions(entityType: string): readonly PublicAction[] {
    const config = this.getPublicActionsConfig(entityType);
    if (!config) return [];
    return isInheritedActions(config) ? config.actions : config;
  }

  /** Get entity type from which public actions are inherited. Returns null if source or none. */
  getPublicInheritanceSource(entityType: string): string | null {
    const config = this.getPublicActionsConfig(entityType);
    return config && isInheritedActions(config) ? config.inherits : null;
  }

  /** Check if entity is a public actions source (context with publicActions). */
  publicGuardSource(entityType: string): boolean {
    return this.publicActionsSourceTypes.includes(entityType as TContexts);
  }
}

/** Create a new entity hierarchy builder with a role registry. */
export function createEntityHierarchy<R extends { all: readonly string[] }>(
  roles: R,
): EntityHierarchyBuilder<R, never, never, never> {
  return new EntityHierarchyBuilder(roles);
}


