// Role Registry
function buildRoleMap<T extends readonly string[]>(roleNames: T): { readonly [K in T[number]]: K } {
  return Object.fromEntries(roleNames.map((r) => [r, r])) as { readonly [K in T[number]]: K };
}

/** Create frozen role registry with type-safe role name access. */
export function createRoleRegistry<const T extends readonly string[]>(
  roleNames: T,
): { readonly all: T } & { readonly [K in T[number]]: K } {
  const registry = Object.assign({ all: roleNames }, buildRoleMap(roleNames));
  return Object.freeze(registry) as { readonly all: T } & { readonly [K in T[number]]: K };
}

export type RoleFromRegistry<R extends { all: readonly string[] }> = R['all'][number];

export type EntityKind = 'user' | 'context' | 'product';

interface UserEntry { kind: 'user' }
interface ContextEntry<R extends string = string> {
  kind: 'context';
  parent: string | null;
  roles: readonly R[];
  /** Non-ancestor context entities referenced as optional denormalized columns. */
  relatedContexts?: readonly string[];
}
interface ProductEntry {
  kind: 'product';
  parent: string;
  /** Host product this entity belongs to (product-to-product ownership, e.g. attachment → task). */
  host?: string;
  /** Non-ancestor context entities referenced as optional denormalized columns. */
  relatedContexts?: readonly string[];
  /** Ancestors whose id columns are nullable: rows may attach above the declared parent. */
  nullableAncestors?: readonly string[];
}
type EntityEntry = UserEntry | ContextEntry | ProductEntry;

/** A host relationship between two products, with the hosted table's host id column. */
export interface HostRelation {
  /** The hosted product (e.g. 'attachment'). */
  hostedType: string;
  /** The host product (e.g. 'task'). */
  hostType: string;
  /** Generated nullable id column on the hosted table (e.g. 'taskId'). */
  hostIdColumn: string;
}

export interface ContextEntityView<R extends string = string> {
  readonly kind: 'context';
  readonly parent: string | null;
  readonly roles: readonly R[];
  readonly relatedContexts?: readonly string[];
}

export interface ProductEntityView {
  readonly kind: 'product';
  readonly parent: string;
  readonly host?: string;
  readonly relatedContexts?: readonly string[];
  readonly nullableAncestors?: readonly string[];
}

export interface UserEntityView { readonly kind: 'user' }

export type EntityView = UserEntityView | ContextEntityView | ProductEntityView;

// Hierarchy Builder

/**
 * Builder for entity hierarchy. Chain calls to define entities, then call build().
 * See README.md in this directory for the fork contract and the home/related/host/
 * nullable-ancestor model.
 */
class EntityHierarchyBuilder<
  TRoles extends { all: readonly string[] },
  TContexts extends string = never,
  TProducts extends string = never,
  TParentMap extends Record<string, string | null> = Record<never, never>,
  TRelatedMap extends Record<string, string> = Record<never, never>,
  THostMap extends Record<string, string> = Record<never, never>,
  TNullableMap extends Record<string, string> = Record<never, never>,
> {
  private readonly entities: Map<string, EntityEntry>;
  private readonly roles: TRoles;

  constructor(roles: TRoles, entities?: ReadonlyMap<string, EntityEntry>) {
    this.roles = roles;
    this.entities = new Map(entities);
  }

  /** Copy the current entities and add one more, the basis for immutable, cast-free chaining. */
  private withEntity(name: string, entry: EntityEntry): Map<string, EntityEntry> {
    const entities = new Map(this.entities);
    entities.set(name, entry);
    return entities;
  }

  /** Add user entity (required, once). */
  user(): EntityHierarchyBuilder<TRoles, TContexts, TProducts, TParentMap, TRelatedMap, THostMap, TNullableMap> {
    if (this.entities.has('user')) throw new Error('EntityHierarchy: user() can only be called once');
    return new EntityHierarchyBuilder<TRoles, TContexts, TProducts, TParentMap, TRelatedMap, THostMap, TNullableMap>(
      this.roles,
      this.withEntity('user', { kind: 'user' }),
    );
  }

  /** Add a context entity with parent reference and roles. */
  context<N extends string, P extends TContexts | null, const RC extends readonly TContexts[] = []>(
    name: N,
    options: { parent: P; roles: readonly RoleFromRegistry<TRoles>[]; relatedContexts?: RC },
  ): EntityHierarchyBuilder<
    TRoles,
    TContexts | N,
    TProducts,
    TParentMap & { [K in N]: P },
    TRelatedMap & { [K in N]: RC[number] },
    THostMap,
    TNullableMap
  > {
    this.validateName(name);
    this.validateParent(name, options.parent, 'context');
    this.validateRoles(name, options.roles);
    this.validateRelatedContexts(name, options.parent, options.relatedContexts);
    return new EntityHierarchyBuilder<
      TRoles,
      TContexts | N,
      TProducts,
      TParentMap & { [K in N]: P },
      TRelatedMap & { [K in N]: RC[number] },
      THostMap,
      TNullableMap
    >(
      this.roles,
      this.withEntity(name, {
        kind: 'context',
        parent: options.parent,
        roles: options.roles,
        relatedContexts: options.relatedContexts,
      }),
    );
  }

  /**
   * Add a product entity. Every product has exactly one home context (`parent`): a non-null
   * `<context>Id` column and the most-specific link used for permissions and public-read
   * inheritance. Optional `relatedContexts`, `host`, and `nullableAncestors` add further
   * non-home links; see README.md in this directory for the full model.
   */
  product<
    N extends string,
    P extends TContexts,
    const RC extends readonly TContexts[] = [],
    H extends TProducts = never,
    const NA extends readonly TContexts[] = [],
  >(
    name: N,
    options: { parent: P; host?: H; relatedContexts?: RC; nullableAncestors?: NA },
  ): EntityHierarchyBuilder<
    TRoles,
    TContexts,
    TProducts | N,
    TParentMap & { [K in N]: P },
    TRelatedMap & { [K in N]: RC[number] },
    THostMap & ([H] extends [never] ? Record<never, never> : { [K in N]: H }),
    TNullableMap & { [K in N]: NA[number] }
  > {
    this.validateName(name);
    this.validateParent(name, options.parent, 'product');
    this.validateHost(name, options.parent, options.host);
    this.validateRelatedContexts(name, options.parent, options.relatedContexts);
    this.validateNullableAncestors(name, options.parent, options.nullableAncestors);
    return new EntityHierarchyBuilder<
      TRoles,
      TContexts,
      TProducts | N,
      TParentMap & { [K in N]: P },
      TRelatedMap & { [K in N]: RC[number] },
      THostMap & ([H] extends [never] ? Record<never, never> : { [K in N]: H }),
      TNullableMap & { [K in N]: NA[number] }
    >(
      this.roles,
      this.withEntity(name, {
        kind: 'product',
        parent: options.parent,
        host: options.host,
        relatedContexts: options.relatedContexts,
        nullableAncestors: options.nullableAncestors,
      }),
    );
  }

  /** Build and freeze the hierarchy. */
  build(): EntityHierarchy<TRoles, TContexts, TProducts, TParentMap, TRelatedMap, THostMap, TNullableMap> {
    if (!this.entities.has('user')) throw new Error('EntityHierarchy: user() must be called before build()');
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
    if (parent === null) {
      // Products always need a home context (also enforced at the type level)
      if (kind === 'product') {
        throw new Error(
          `EntityHierarchy: product "${name}" has no parent. ` +
            'Every product needs a context parent (its home) to derive permissions from.',
        );
      }
      return;
    }

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

  private validateHost(name: string, parent: string, host?: string): void {
    if (!host) return;

    const hostEntry = this.entities.get(host);
    if (!hostEntry) {
      throw new Error(
        `EntityHierarchy: product "${name}" references unknown host "${host}". ` +
          'Hosts must be defined before hosted products.',
      );
    }
    if (hostEntry.kind !== 'product') {
      throw new Error(
        `EntityHierarchy: product "${name}" host "${host}" must be a product entity, but it is a ${hostEntry.kind} entity.`,
      );
    }
    if (hostEntry.host) {
      throw new Error(
        `EntityHierarchy: product "${name}" host "${host}" is itself hosted — host chains are not supported.`,
      );
    }
    // Hosted rows inherit the host's context scope; sharing the home context is what keeps
    // the existing ancestor/permission machinery working unchanged.
    if (hostEntry.parent !== parent) {
      throw new Error(
        `EntityHierarchy: product "${name}" (parent "${parent}") and its host "${host}" (parent "${hostEntry.parent}") ` +
          'must share the same home context.',
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

  /**
   * Validate optional denormalized context references. Each must be an already-defined
   * context entity that is NOT part of the strict ancestor chain (which already produces
   * its own non-null id column) and not the entity itself.
   */
  private validateRelatedContexts(name: string, parent: string | null, relatedContexts?: readonly string[]): void {
    if (!relatedContexts?.length) return;

    const ancestors = new Set<string>();
    let current = parent;
    while (current !== null) {
      ancestors.add(current);
      const entry = this.entities.get(current);
      current = entry && entry.kind !== 'user' ? entry.parent : null;
    }

    const seen = new Set<string>();
    for (const related of relatedContexts) {
      if (related === name) {
        throw new Error(`EntityHierarchy: entity "${name}" cannot reference itself in relatedContexts`);
      }
      if (seen.has(related)) {
        throw new Error(`EntityHierarchy: entity "${name}" has duplicate relatedContext "${related}"`);
      }
      seen.add(related);

      const entry = this.entities.get(related);
      if (!entry) {
        throw new Error(
          `EntityHierarchy: entity "${name}" references unknown relatedContext "${related}". ` +
            'Related contexts must be defined before they are referenced.',
        );
      }
      if (entry.kind !== 'context') {
        throw new Error(
          `EntityHierarchy: entity "${name}" relatedContext "${related}" must be a context entity, ` +
            `but it is a ${entry.kind} entity.`,
        );
      }
      if (ancestors.has(related)) {
        throw new Error(
          `EntityHierarchy: entity "${name}" relatedContext "${related}" is already an ancestor. ` +
            'Ancestors are referenced via the strict parent chain, not relatedContexts.',
        );
      }
    }
  }

  /**
   * Validate nullable-ancestor declarations. Each must be part of the strict ancestor chain,
   * and the chain root must stay non-null: a row with every ancestor id null would belong to
   * no context at all (counters, seq scoping and permissions all need at least the root).
   */
  private validateNullableAncestors(name: string, parent: string, nullableAncestors?: readonly string[]): void {
    if (!nullableAncestors?.length) return;

    const chain: string[] = [];
    let current: string | null = parent;
    while (current !== null) {
      chain.push(current);
      const entry = this.entities.get(current);
      current = entry && entry.kind !== 'user' ? entry.parent : null;
    }
    const root = chain[chain.length - 1];

    const seen = new Set<string>();
    for (const ancestor of nullableAncestors) {
      if (seen.has(ancestor)) {
        throw new Error(`EntityHierarchy: product "${name}" has duplicate nullableAncestor "${ancestor}"`);
      }
      seen.add(ancestor);

      if (!chain.includes(ancestor)) {
        throw new Error(
          `EntityHierarchy: product "${name}" nullableAncestor "${ancestor}" is not an ancestor. ` +
            `Ancestor chain: ${chain.join(' > ')}.`,
        );
      }
      if (ancestor === root) {
        throw new Error(
          `EntityHierarchy: product "${name}" nullableAncestor "${ancestor}" is the chain root and must stay non-null.`,
        );
      }
    }
  }

}

// Entity Hierarchy (Frozen Result)

/** Frozen entity hierarchy with query methods. Created by EntityHierarchyBuilder.build(). */
export class EntityHierarchy<
  TRoles extends { all: readonly string[] },
  TContexts extends string = string,
  TProducts extends string = string,
  TParentMap extends Record<string, string | null> = Record<string, string | null>,
  TRelatedMap extends Record<string, string> = Record<string, string>,
  THostMap extends Record<string, string> = Record<string, string>,
  TNullableMap extends Record<string, string> = Record<string, string>,
> {
  /** Phantom type carrier: maps each entity to its strict parent (null = root). Type-only, no runtime value. */
  declare readonly _parentMap: TParentMap;
  /** Phantom type carrier: maps each entity to its related (non-ancestor) context union. Type-only, no runtime value. */
  declare readonly _relatedMap: TRelatedMap;
  /** Phantom type carrier: maps each hosted product to its host product. Type-only, no runtime value. */
  declare readonly _hostMap: THostMap;
  /** Phantom type carrier: maps each product to its nullable-ancestor union. Type-only, no runtime value. */
  declare readonly _nullableMap: TNullableMap;

  private readonly entities: ReadonlyMap<string, EntityEntry>;
  private readonly roleRegistry: TRoles;
  private readonly ancestorCache = new Map<string, readonly string[]>();
  private readonly childrenCache = new Map<string, readonly (TContexts | TProducts)[]>();
  private readonly descendantsCache = new Map<string, readonly (TContexts | TProducts)[]>();
  private readonly hostRelations: readonly HostRelation[];

  readonly contextTypes: readonly TContexts[];
  readonly productTypes: readonly TProducts[];
  readonly allTypes: readonly ('user' | TContexts | TProducts)[];
  readonly relatableContextTypes: readonly TContexts[];

  constructor(roles: TRoles, entities: Map<string, EntityEntry>) {
    this.roleRegistry = roles;
    this.entities = new Map(entities);

    // Single-pass computation of all type arrays
    const contexts: TContexts[] = [];
    const products: TProducts[] = [];
    const all: ('user' | TContexts | TProducts)[] = [];
    const relatableContexts = new Set<TContexts>();

    const hostRelations: HostRelation[] = [];

    for (const [name, entry] of entities) {
      all.push(name as 'user' | TContexts | TProducts);

      if (entry.kind === 'context') {
        contexts.push(name as TContexts);
      } else if (entry.kind === 'product') {
        products.push(name as TProducts);
        relatableContexts.add(entry.parent as TContexts);
        if (entry.host) {
          hostRelations.push({ hostedType: name, hostType: entry.host, hostIdColumn: `${entry.host}Id` });
        }
      }
    }

    this.contextTypes = Object.freeze(contexts);
    this.productTypes = Object.freeze(products);
    this.allTypes = Object.freeze(all);
    this.relatableContextTypes = Object.freeze([...relatableContexts]);
    this.hostRelations = Object.freeze(hostRelations);
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

  /**
   * Get optional denormalized related context types for an entity (non-ancestor contexts
   * declared via `relatedContexts`). These map to NULLABLE id columns. Returns [] if none.
   */
  getRelatedContexts(entityType: string): readonly TContexts[] {
    const entry = this.entities.get(entityType);
    if (!entry || entry.kind === 'user') return [];
    return (entry.relatedContexts ?? []) as readonly TContexts[];
  }

  /**
   * Ancestors declared nullable for a product (rows may attach above the declared parent).
   * These map to NULLABLE id columns; all other ancestor id columns are non-null. Returns [] if none.
   */
  getNullableAncestors(entityType: string): readonly TContexts[] {
    const entry = this.entities.get(entityType);
    if (entry?.kind !== 'product') return [];
    return (entry.nullableAncestors ?? []) as readonly TContexts[];
  }

  /** Get entity view (kind + parent + roles if context). */
  getConfig(entityType: string): EntityView | undefined {
    const entry = this.entities.get(entityType);
    if (!entry) return undefined;
    if (entry.kind === 'user') return { kind: 'user' };
    if (entry.kind === 'context') {
      return { kind: 'context', parent: entry.parent, roles: entry.roles, relatedContexts: entry.relatedContexts };
    }
    return {
      kind: 'product',
      parent: entry.parent,
      host: entry.host,
      relatedContexts: entry.relatedContexts,
      nullableAncestors: entry.nullableAncestors,
    };
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
      if (current === undefined) continue;
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

  // Host relationships (product-to-product ownership)

  /** The host product this entity belongs to (e.g. attachment → 'task'). Undefined if not hosted. */
  getHostType(entityType: string): TProducts | undefined {
    const entry = this.entities.get(entityType);
    return entry?.kind === 'product' ? (entry.host as TProducts | undefined) : undefined;
  }

  /** Product types hosted by the given product (e.g. task → ['attachment']). */
  getHostedTypes(hostType: string): readonly TProducts[] {
    return this.getHostRelations()
      .filter((relation) => relation.hostType === hostType)
      .map((relation) => relation.hostedType as TProducts);
  }

  /** All host relationships with their generated host id column names. */
  getHostRelations(): readonly HostRelation[] {
    return this.hostRelations;
  }
}

/** Create a new entity hierarchy builder with a role registry. */
export function createEntityHierarchy<R extends { all: readonly string[] }>(
  roles: R,
): EntityHierarchyBuilder<R, never, never> {
  return new EntityHierarchyBuilder(roles);
}


