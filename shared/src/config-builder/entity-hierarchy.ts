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

export type EntityKind = 'user' | 'channel' | 'product';

interface UserEntry { kind: 'user' }
interface ChannelEntry<R extends string = string> {
  kind: 'channel';
  parent: string | null;
  roles: readonly R[];
  /** Non-ancestor channel entities referenced as optional denormalized columns. */
  relatedChannels?: readonly string[];
}
interface ProductEntry {
  kind: 'product';
  parent: string;
  /** Non-ancestor channel entities referenced as optional denormalized columns. */
  relatedChannels?: readonly string[];
  /** Ancestors whose id columns are nullable: rows may attach above the declared parent. */
  nullableAncestors?: readonly string[];
}
type EntityEntry = UserEntry | ChannelEntry | ProductEntry;

export interface ChannelEntityView<R extends string = string> {
  readonly kind: 'channel';
  readonly parent: string | null;
  readonly roles: readonly R[];
  readonly relatedChannels?: readonly string[];
}

export interface ProductEntityView {
  readonly kind: 'product';
  readonly parent: string;
  readonly relatedChannels?: readonly string[];
  readonly nullableAncestors?: readonly string[];
}

export interface UserEntityView { readonly kind: 'user' }

export type EntityView = UserEntityView | ChannelEntityView | ProductEntityView;

// Hierarchy Builder

/**
 * Builder for entity hierarchy. Chain calls to define entities, then call build().
 *
 * @see README.md
 */
class EntityHierarchyBuilder<
  TRoles extends { all: readonly string[] },
  TChannels extends string = never,
  TProducts extends string = never,
  TParentMap extends Record<string, string | null> = Record<never, never>,
  TRelatedMap extends Record<string, string> = Record<never, never>,
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
  user(): EntityHierarchyBuilder<TRoles, TChannels, TProducts, TParentMap, TRelatedMap, TNullableMap> {
    if (this.entities.has('user')) throw new Error('EntityHierarchy: user() can only be called once');
    return new EntityHierarchyBuilder<TRoles, TChannels, TProducts, TParentMap, TRelatedMap, TNullableMap>(
      this.roles,
      this.withEntity('user', { kind: 'user' }),
    );
  }

  /** Add a channel entity with parent reference and roles. */
  channel<N extends string, P extends TChannels | null, const RC extends readonly TChannels[] = []>(
    name: N,
    options: { parent: P; roles: readonly RoleFromRegistry<TRoles>[]; relatedChannels?: RC },
  ): EntityHierarchyBuilder<
    TRoles,
    TChannels | N,
    TProducts,
    TParentMap & { [K in N]: P },
    TRelatedMap & { [K in N]: RC[number] },
    TNullableMap
  > {
    this.validateName(name);
    this.validateParent(name, options.parent, 'channel');
    this.validateRoles(name, options.roles);
    this.validateRelatedChannels(name, options.parent, options.relatedChannels);
    return new EntityHierarchyBuilder<
      TRoles,
      TChannels | N,
      TProducts,
      TParentMap & { [K in N]: P },
      TRelatedMap & { [K in N]: RC[number] },
      TNullableMap
    >(
      this.roles,
      this.withEntity(name, {
        kind: 'channel',
        parent: options.parent,
        roles: options.roles,
        relatedChannels: options.relatedChannels,
      }),
    );
  }

  /**
   * Add a product entity. Every product has exactly one home channel (`parent`): a non-null
   * `<channel>Id` column and the most-specific link used for permissions and public-read
   * inheritance. Optional `relatedChannels` and `nullableAncestors` add further
   * non-home links.
   *
   * @see README.md
   */
  product<
    N extends string,
    P extends TChannels,
    const RC extends readonly TChannels[] = [],
    const NA extends readonly TChannels[] = [],
  >(
    name: N,
    options: { parent: P; relatedChannels?: RC; nullableAncestors?: NA },
  ): EntityHierarchyBuilder<
    TRoles,
    TChannels,
    TProducts | N,
    TParentMap & { [K in N]: P },
    TRelatedMap & { [K in N]: RC[number] },
    TNullableMap & { [K in N]: NA[number] }
  > {
    this.validateName(name);
    this.validateParent(name, options.parent, 'product');
    this.validateRelatedChannels(name, options.parent, options.relatedChannels);
    this.validateNullableAncestors(name, options.parent, options.nullableAncestors);
    return new EntityHierarchyBuilder<
      TRoles,
      TChannels,
      TProducts | N,
      TParentMap & { [K in N]: P },
      TRelatedMap & { [K in N]: RC[number] },
      TNullableMap & { [K in N]: NA[number] }
    >(
      this.roles,
      this.withEntity(name, {
        kind: 'product',
        parent: options.parent,
        relatedChannels: options.relatedChannels,
        nullableAncestors: options.nullableAncestors,
      }),
    );
  }

  /** Build and freeze the hierarchy. */
  build(): EntityHierarchy<TRoles, TChannels, TProducts, TParentMap, TRelatedMap, TNullableMap> {
    if (!this.entities.has('user')) throw new Error('EntityHierarchy: user() must be called before build()');
    if (!this.entities.has('organization')) throw new Error('EntityHierarchy: organization channel is required');
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

  private validateParent(name: string, parent: string | null, kind: 'channel' | 'product'): void {
    if (parent === null) {
      // Products always need a home channel (also enforced at the type level)
      if (kind === 'product') {
        throw new Error(
          `EntityHierarchy: product "${name}" has no parent. ` +
            'Every product needs a channel parent (its home) to derive permissions from.',
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
    if (parentEntry.kind !== 'channel') {
      throw new Error(
        `EntityHierarchy: ${kind} "${name}" parent "${parent}" must be a channel entity, ` +
          `but it is a ${parentEntry.kind} entity.`,
      );
    }
  }

  private validateRoles(name: string, roles: readonly string[]): void {
    if (roles.length === 0) {
      throw new Error(`EntityHierarchy: channel "${name}" must have at least one role`);
    }

    const validRoles = new Set(this.roles.all);
    for (const role of roles) {
      if (!validRoles.has(role)) {
        throw new Error(
          `EntityHierarchy: channel "${name}" has invalid role "${role}". ` +
            `Valid roles: ${[...validRoles].join(', ')}`,
        );
      }
    }
  }

  /**
   * Validate optional denormalized channel references. Each must be an already-defined
   * channel entity that is NOT part of the strict ancestor chain (which already produces
   * its own non-null id column) and not the entity itself.
   */
  private validateRelatedChannels(name: string, parent: string | null, relatedChannels?: readonly string[]): void {
    if (!relatedChannels?.length) return;

    const ancestors = new Set<string>();
    let current = parent;
    while (current !== null) {
      ancestors.add(current);
      const entry = this.entities.get(current);
      current = entry && entry.kind !== 'user' ? entry.parent : null;
    }

    const seen = new Set<string>();
    for (const related of relatedChannels) {
      if (related === name) {
        throw new Error(`EntityHierarchy: entity "${name}" cannot reference itself in relatedChannels`);
      }
      if (seen.has(related)) {
        throw new Error(`EntityHierarchy: entity "${name}" has duplicate relatedChannel "${related}"`);
      }
      seen.add(related);

      const entry = this.entities.get(related);
      if (!entry) {
        throw new Error(
          `EntityHierarchy: entity "${name}" references unknown relatedChannel "${related}". ` +
            'Related channels must be defined before they are referenced.',
        );
      }
      if (entry.kind !== 'channel') {
        throw new Error(
          `EntityHierarchy: entity "${name}" relatedChannel "${related}" must be a channel entity, ` +
            `but it is a ${entry.kind} entity.`,
        );
      }
      if (ancestors.has(related)) {
        throw new Error(
          `EntityHierarchy: entity "${name}" relatedChannel "${related}" is already an ancestor. ` +
            'Ancestors are referenced via the strict parent chain, not relatedChannels.',
        );
      }
    }
  }

  /**
   * Validate nullable-ancestor declarations. Each must be part of the strict ancestor chain,
   * and the chain root must stay non-null: a row with every ancestor id null would belong to
   * no channel at all (counters, seq scoping and permissions all need at least the root).
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
  TChannels extends string = string,
  TProducts extends string = string,
  TParentMap extends Record<string, string | null> = Record<string, string | null>,
  TRelatedMap extends Record<string, string> = Record<string, string>,
  TNullableMap extends Record<string, string> = Record<string, string>,
> {
  /** Phantom type carrier: maps each entity to its strict parent (null = root). Type-only, no runtime value. */
  declare readonly _parentMap: TParentMap;
  /** Phantom type carrier: maps each entity to its related (non-ancestor) channel union. Type-only, no runtime value. */
  declare readonly _relatedMap: TRelatedMap;
  /** Phantom type carrier: maps each product to its nullable-ancestor union. Type-only, no runtime value. */
  declare readonly _nullableMap: TNullableMap;

  private readonly entities: ReadonlyMap<string, EntityEntry>;
  private readonly roleRegistry: TRoles;
  private readonly ancestorCache = new Map<string, readonly string[]>();
  private readonly childrenCache = new Map<string, readonly (TChannels | TProducts)[]>();
  private readonly descendantsCache = new Map<string, readonly (TChannels | TProducts)[]>();

  readonly channelTypes: readonly TChannels[];
  readonly productTypes: readonly TProducts[];
  readonly allTypes: readonly ('user' | TChannels | TProducts)[];
  readonly relatableChannelTypes: readonly TChannels[];

  constructor(roles: TRoles, entities: Map<string, EntityEntry>) {
    this.roleRegistry = roles;
    this.entities = new Map(entities);

    // Single-pass computation of all type arrays
    const channels: TChannels[] = [];
    const products: TProducts[] = [];
    const all: ('user' | TChannels | TProducts)[] = [];
    const relatableChannels = new Set<TChannels>();

    for (const [name, entry] of entities) {
      all.push(name as 'user' | TChannels | TProducts);

      if (entry.kind === 'channel') {
        channels.push(name as TChannels);
      } else if (entry.kind === 'product') {
        products.push(name as TProducts);
        relatableChannels.add(entry.parent as TChannels);
      }
    }

    this.channelTypes = Object.freeze(channels);
    this.productTypes = Object.freeze(products);
    this.allTypes = Object.freeze(all);
    this.relatableChannelTypes = Object.freeze([...relatableChannels]);
    Object.freeze(this);
  }

  getKind(entityType: string): EntityKind | undefined {
    return this.entities.get(entityType)?.kind;
  }

  isChannel(entityType: string): entityType is TChannels {
    return this.getKind(entityType) === 'channel';
  }

  isProduct(entityType: string): entityType is TProducts {
    return this.getKind(entityType) === 'product';
  }

  /** Get roles for a channel entity. Returns empty array for non-channel. */
  getRoles(channelType: string): readonly RoleFromRegistry<TRoles>[] {
    const entry = this.entities.get(channelType);
    return entry?.kind === 'channel' ? (entry.roles as readonly RoleFromRegistry<TRoles>[]) : [];
  }

  /** Get the direct parent (always a channel entity). Returns null for root entities or user. */
  getParent(entityType: string): TChannels | null {
    const entry = this.entities.get(entityType);
    return entry && entry.kind !== 'user' ? (entry.parent as TChannels | null) : null;
  }

  /** Get ordered ancestors (most-specific → root). Example: task → ['project', 'organization'] */
  getOrderedAncestors(entityType: string): readonly TChannels[] {
    const cached = this.ancestorCache.get(entityType);
    if (cached) return cached as readonly TChannels[];

    const ancestors: TChannels[] = [];
    let current = this.getParent(entityType);
    while (current !== null) {
      const entry = this.entities.get(current);
      if (!entry) break;
      if (entry.kind === 'channel') ancestors.push(current as TChannels);
      current = entry.kind === 'user' ? null : (entry.parent as TChannels | null);
    }

    const frozen = Object.freeze(ancestors);
    this.ancestorCache.set(entityType, frozen);
    return frozen;
  }

  /**
   * Get optional denormalized related channel types for an entity (non-ancestor channels
   * declared via `relatedChannels`). These map to NULLABLE id columns. Returns [] if none.
   */
  getRelatedChannels(entityType: string): readonly TChannels[] {
    const entry = this.entities.get(entityType);
    if (!entry || entry.kind === 'user') return [];
    return (entry.relatedChannels ?? []) as readonly TChannels[];
  }

  /**
   * Ancestors declared nullable for a product (rows may attach above the declared parent).
   * These map to NULLABLE id columns; all other ancestor id columns are non-null. Returns [] if none.
   */
  getNullableAncestors(entityType: string): readonly TChannels[] {
    const entry = this.entities.get(entityType);
    if (entry?.kind !== 'product') return [];
    return (entry.nullableAncestors ?? []) as readonly TChannels[];
  }

  /** Get entity view (kind + parent + roles if channel). */
  getConfig(entityType: string): EntityView | undefined {
    const entry = this.entities.get(entityType);
    if (!entry) return undefined;
    if (entry.kind === 'user') return { kind: 'user' };
    if (entry.kind === 'channel') {
      return { kind: 'channel', parent: entry.parent, roles: entry.roles, relatedChannels: entry.relatedChannels };
    }
    return {
      kind: 'product',
      parent: entry.parent,
      relatedChannels: entry.relatedChannels,
      nullableAncestors: entry.nullableAncestors,
    };
  }

  /** Get product entity view. */
  getProductConfig(entityType: string): ProductEntityView | undefined {
    const config = this.getConfig(entityType);
    return config?.kind === 'product' ? config : undefined;
  }

  /** Get channel entity view. */
  getChannelConfig(entityType: string): ChannelEntityView<RoleFromRegistry<TRoles>> | undefined {
    const config = this.getConfig(entityType);
    return config?.kind === 'channel' ? (config as ChannelEntityView<RoleFromRegistry<TRoles>>) : undefined;
  }

  hasAncestor(entityType: string, ancestor: string): boolean {
    return this.getOrderedAncestors(entityType).includes(ancestor as TChannels);
  }

  /** Get direct children. Cached. */
  getChildren(channelType: string): readonly (TChannels | TProducts)[] {
    const cached = this.childrenCache.get(channelType);
    if (cached) return cached;

    const children: (TChannels | TProducts)[] = [];
    for (const [name, entry] of this.entities) {
      if (entry.kind !== 'user' && entry.parent === channelType) {
        children.push(name as TChannels | TProducts);
      }
    }

    const frozen = Object.freeze(children);
    this.childrenCache.set(channelType, frozen);
    return frozen;
  }

  /** Get all descendants (breadth-first). Cached. */
  getOrderedDescendants(channelType: string): readonly (TChannels | TProducts)[] {
    const cached = this.descendantsCache.get(channelType);
    if (cached) return cached;

    const descendants: (TChannels | TProducts)[] = [];
    const queue = [...this.getChildren(channelType)];
    let i = 0;
    while (i < queue.length) {
      const current = queue[i++];
      if (current === undefined) continue;
      descendants.push(current);
      if (this.isChannel(current)) queue.push(...this.getChildren(current));
    }

    const frozen = Object.freeze(descendants);
    this.descendantsCache.set(channelType, frozen);
    return frozen;
  }

  get roles(): TRoles {
    return this.roleRegistry;
  }
}

/** Create a new entity hierarchy builder with a role registry. */
export function createEntityHierarchy<R extends { all: readonly string[] }>(
  roles: R,
): EntityHierarchyBuilder<R, never, never> {
  return new EntityHierarchyBuilder(roles);
}


