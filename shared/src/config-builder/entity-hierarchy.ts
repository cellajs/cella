import {
  entityIdColumnKey,
  entityIdColumnName,
  possibleHomeChannels,
  type ResolvedAncestor,
  resolveDeepestAncestorId,
  resolveNonNullAncestors,
} from './resolve-row-channel.ts';
import {
  computeAncestorPath,
  computeChannelPath,
  computeProductPath,
  deepestAncestorSql,
  pathColumnSql,
} from './row-path.ts';

function buildRoleMap<T extends readonly string[]>(roleNames: T): { readonly [K in T[number]]: K } {
  return Object.fromEntries(roleNames.map((r) => [r, r])) as { readonly [K in T[number]]: K };
}

export function createRoleRegistry<const T extends readonly string[]>(
  roleNames: T,
): { readonly all: T } & { readonly [K in T[number]]: K } {
  const registry = Object.assign({ all: roleNames }, buildRoleMap(roleNames));
  return Object.freeze(registry) as { readonly all: T } & { readonly [K in T[number]]: K };
}

export type RoleFromRegistry<R extends { all: readonly string[] }> = R['all'][number];

export type EntityKind = 'user' | 'channel' | 'product';

interface UserEntry {
  kind: 'user';
}
interface ChannelEntry<R extends string = string> {
  kind: 'channel';
  parent: string | null;
  roles: readonly R[];
  /** Non-ancestor channel entities referenced as optional denormalized columns. */
  relatedChannels?: readonly string[];
  /**
   * Explicit organization-membership escalation: the organization role each of this channel's
   * roles materializes as when a membership here auto-creates the organization row. When declared,
   * the map must cover every role of the channel; there is no implicit fallback.
   */
  organizationRoles?: Readonly<Record<string, string>>;
  /**
   * Roles of THIS channel whose product grants cover the whole subtree below it, not only rows
   * homed at this level. Undeclared roles are home-scoped. Compiled into `elevatedGrants`.
   */
  elevated?: readonly string[];
}
interface ProductEntry {
  kind: 'product';
  parent: string;
  relatedChannels?: readonly string[];
  /** Ancestors whose id columns are nullable: rows may attach above the declared parent. */
  nullableAncestors?: readonly string[];
}
type EntityEntry = UserEntry | ChannelEntry | ProductEntry;

export interface ChannelView<R extends string = string> {
  readonly kind: 'channel';
  readonly parent: string | null;
  readonly roles: readonly R[];
  readonly relatedChannels?: readonly string[];
  readonly organizationRoles?: Readonly<Record<string, string>>;
  readonly elevated?: readonly string[];
}

export interface ProductView {
  readonly kind: 'product';
  readonly parent: string;
  readonly relatedChannels?: readonly string[];
  readonly nullableAncestors?: readonly string[];
}

export interface UserEntityView {
  readonly kind: 'user';
}

export type EntityView = UserEntityView | ChannelView | ProductView;

/** Chain calls to declare entities, then call build(). @see README.md */
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

  /** Copy and extend, so chaining stays immutable and cast-free. */
  private withEntity(name: string, entry: EntityEntry): Map<string, EntityEntry> {
    const entities = new Map(this.entities);
    entities.set(name, entry);
    return entities;
  }

  /** Required exactly once before build(). */
  user(): EntityHierarchyBuilder<TRoles, TChannels, TProducts, TParentMap, TRelatedMap, TNullableMap> {
    if (this.entities.has('user')) throw new Error('EntityHierarchy: user() can only be called once');
    return new EntityHierarchyBuilder<TRoles, TChannels, TProducts, TParentMap, TRelatedMap, TNullableMap>(
      this.roles,
      this.withEntity('user', { kind: 'user' }),
    );
  }

  /**
   * The tenant-bound spine: required exactly once, before any other channel, and the only
   * parentless entity. Every channel and product below it carries `organizationId`.
   */
  organization<const RO extends readonly RoleFromRegistry<TRoles>[]>(options: {
    roles: RO;
    /** Roles whose product grants cover the whole organization; see {@link channel}. */
    elevated?: readonly RO[number][];
  }): EntityHierarchyBuilder<
    TRoles,
    TChannels | 'organization',
    TProducts,
    TParentMap & { organization: null },
    TRelatedMap,
    TNullableMap
  > {
    this.validateName('organization');
    this.validateRoles('organization', options.roles);
    this.validateElevated('organization', options.roles, options.elevated);
    return new EntityHierarchyBuilder<
      TRoles,
      TChannels | 'organization',
      TProducts,
      TParentMap & { organization: null },
      TRelatedMap,
      TNullableMap
    >(
      this.roles,
      this.withEntity('organization', {
        kind: 'channel',
        parent: null,
        roles: options.roles,
        elevated: options.elevated,
      }),
    );
  }

  /** A channel below the organization (`parent` is the organization or a channel under it). */
  channel<
    N extends string,
    P extends TChannels,
    const RO extends readonly RoleFromRegistry<TRoles>[],
    const RC extends readonly TChannels[] = [],
  >(
    name: N,
    options: {
      parent: P;
      roles: RO;
      relatedChannels?: RC;
      /**
       * Organization role each of this channel's roles escalates to when a membership here
       * auto-creates the organization membership row. Complete when declared (every role must be
       * mapped, no implicit fallback). A channel without the map cannot auto-create organization
       * memberships (insertMemberships throws).
       */
      organizationRoles?: Record<RO[number], RoleFromRegistry<TRoles>>;
      /**
       * Roles of this channel whose product grants cover its whole subtree; undeclared roles
       * grant only rows homed at this level. Read by the engine, the collection-scope SQL
       * compiler, SSE dispatch and the frontend view derivation, which stay mirror-consistent
       * through the compiled `elevatedGrants` set.
       */
      elevated?: readonly RO[number][];
    },
  ): EntityHierarchyBuilder<
    TRoles,
    TChannels | N,
    TProducts,
    TParentMap & { [K in N]: P },
    TRelatedMap & { [K in N]: RC[number] },
    TNullableMap
  > {
    if (name === 'organization') {
      throw new Error('EntityHierarchy: "organization" is the spine, declare it with organization()');
    }
    this.validateName(name);
    this.validateParent(name, options.parent, 'channel');
    this.validateRoles(name, options.roles);
    this.validateRelatedChannels(name, options.parent, options.relatedChannels);
    this.validateOrganizationRoles(name, options.roles, options.organizationRoles);
    this.validateElevated(name, options.roles, options.elevated);
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
        organizationRoles: options.organizationRoles as Readonly<Record<string, string>> | undefined,
        elevated: options.elevated,
      }),
    );
  }

  /** Each elevated role must be one of the channel's own roles. */
  private validateElevated(name: string, roles: readonly string[], elevated?: readonly string[]): void {
    if (!elevated) return;
    for (const role of elevated) {
      if (!roles.includes(role)) {
        throw new Error(
          `EntityHierarchy: channel "${name}" elevates unknown role "${role}". Own roles: ${roles.join(', ')}`,
        );
      }
    }
  }

  /** Keys must be this channel's own roles; values must be organization roles. */
  private validateOrganizationRoles(
    name: string,
    roles: readonly string[],
    organizationRoles?: Partial<Record<string, string>>,
  ): void {
    if (!organizationRoles) return;

    // organization() runs before any channel(), so the vocabulary is known here.
    const organization = this.entities.get('organization');
    const organizationVocabulary = organization?.kind === 'channel' ? organization.roles : [];

    for (const [role, organizationRole] of Object.entries(organizationRoles)) {
      if (!roles.includes(role)) {
        throw new Error(
          `EntityHierarchy: channel "${name}" maps unknown role "${role}" in organizationRoles. Own roles: ${roles.join(', ')}`,
        );
      }
      if (organizationRole !== undefined && !organizationVocabulary.includes(organizationRole)) {
        throw new Error(
          `EntityHierarchy: channel "${name}" maps role "${role}" to "${organizationRole}", which is not an ` +
            `organization role. Organization roles: ${organizationVocabulary.join(', ')}`,
        );
      }
    }

    // Complete when declared: a partial map is a config error, caught here at build time.
    const unmapped = roles.filter((role) => organizationRoles[role] === undefined);
    if (unmapped.length > 0) {
      throw new Error(
        `EntityHierarchy: channel "${name}" declares organizationRoles but leaves ${unmapped.join(', ')} unmapped. ` +
          'The map must cover every role — there is no implicit fallback.',
      );
    }
  }

  /**
   * `parent` is the product's home channel: a non-null `<channel>Id` column and the
   * most-specific link permissions and public-read inheritance read. `relatedChannels` and
   * `nullableAncestors` add further non-home links. @see README.md
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
      throw new Error(
        `EntityHierarchy: ${kind} "${name}" has no parent. ` +
          'Only the organization is parentless; every other entity nests under it.',
      );
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

  /** Each must be an already-defined channel, outside the strict ancestor chain, not itself. */
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
   * Each must be part of the strict ancestor chain, and the organization must stay non-null:
   * counters, seq scoping and permissions all need at least the organization id.
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
      if (ancestor === 'organization') {
        throw new Error(
          `EntityHierarchy: product "${name}" nullableAncestor "${ancestor}" is the organization and must stay non-null.`,
        );
      }
    }
  }
}

export class EntityHierarchy<
  TRoles extends { all: readonly string[] } = { all: readonly string[] },
  TChannels extends string = string,
  TProducts extends string = string,
  TParentMap extends Record<string, string | null> = Record<string, string | null>,
  TRelatedMap extends Record<string, string> = Record<string, string>,
  TNullableMap extends Record<string, string> = Record<string, string>,
> {
  /** Phantom carriers, type-only with no runtime value: strict parent (null = organization), related
   * (non-ancestor) channel union, and per-product nullable-ancestor union. */
  declare readonly _parentMap: TParentMap;
  declare readonly _relatedMap: TRelatedMap;
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
  /** Id-column key per entity type; `appConfig.entityIdColumnKeys` is derived from this. */
  readonly idColumnKeys: { readonly [K in 'user' | TChannels | TProducts]: `${K}Id` };
  /**
   * Compiled `${channelType}:${role}` keys of every declared elevated role: the value the
   * permission engine, SQL scope compiler, SSE dispatch and frontend view derivation consume.
   * Empty when no channel declares elevation: every product grant is then home-scoped.
   */
  readonly elevatedGrants: ReadonlySet<string>;

  constructor(roles: TRoles, entities: Map<string, EntityEntry>) {
    this.roleRegistry = roles;
    this.entities = new Map(entities);

    const channels: TChannels[] = [];
    const products: TProducts[] = [];
    const all: ('user' | TChannels | TProducts)[] = [];
    const relatableChannels = new Set<TChannels>();
    const elevatedGrants = new Set<string>();

    for (const [name, entry] of entities) {
      all.push(name as 'user' | TChannels | TProducts);

      if (entry.kind === 'channel') {
        channels.push(name as TChannels);
        for (const role of entry.elevated ?? []) elevatedGrants.add(`${name}:${role}`);
      } else if (entry.kind === 'product') {
        products.push(name as TProducts);
        relatableChannels.add(entry.parent as TChannels);
      }
    }
    this.elevatedGrants = Object.freeze(elevatedGrants);

    this.channelTypes = Object.freeze(channels);
    this.productTypes = Object.freeze(products);
    this.allTypes = Object.freeze(all);
    this.relatableChannelTypes = Object.freeze([...relatableChannels]);
    // Mapped literal type from a runtime loop; a single assertion bridges the two.
    this.idColumnKeys = Object.freeze(Object.fromEntries(all.map((t) => [t, entityIdColumnKey(t)]))) as {
      readonly [K in 'user' | TChannels | TProducts]: `${K}Id`;
    };
    Object.freeze(this);
  }

  readonly getKind = (entityType: string): EntityKind | undefined => {
    return this.entities.get(entityType)?.kind;
  };

  readonly isChannel = (entityType: string | null | undefined): entityType is TChannels => {
    return !!entityType && this.getKind(entityType) === 'channel';
  };

  readonly isProduct = (entityType: string | null | undefined): entityType is TProducts => {
    return !!entityType && this.getKind(entityType) === 'product';
  };

  /** Empty for non-channel types. */
  readonly getRoles = (channelType: string): readonly RoleFromRegistry<TRoles>[] => {
    const entry = this.entities.get(channelType);
    return entry?.kind === 'channel' ? (entry.roles as readonly RoleFromRegistry<TRoles>[]) : [];
  };

  /**
   * Roles are declared most to least privileged, so the last role is a channel's floor: the invite
   * default, the auto-created associated-membership fallback and the membership column default.
   * Apps with other vocabularies (`guest`, `student`) get their own floor; throws for non-channels.
   */
  readonly getLeastPrivilegedRole = (channelType: string): RoleFromRegistry<TRoles> => {
    const roles = this.getRoles(channelType);
    const role = roles[roles.length - 1];
    if (!role) throw new Error(`Entity type '${channelType}' is not a channel or declares no roles`);
    return role;
  };

  /** The first declared role of a channel; see {@link getLeastPrivilegedRole} for the ordering rule. */
  readonly getMostPrivilegedRole = (channelType: string): RoleFromRegistry<TRoles> => {
    const role = this.getRoles(channelType)[0];
    if (!role) throw new Error(`Entity type '${channelType}' is not a channel or declares no roles`);
    return role;
  };

  /**
   * Explicit organization role a membership role escalates to when it auto-creates the
   * organization membership row; undefined when the channel declares no mapping for it
   * (insertMemberships treats that as a programming error and throws).
   */
  readonly getOrganizationRole = (channelType: string, role: string): RoleFromRegistry<TRoles> | undefined => {
    const entry = this.entities.get(channelType);
    if (entry?.kind !== 'channel') return undefined;
    return entry.organizationRoles?.[role] as RoleFromRegistry<TRoles> | undefined;
  };

  /** Always a channel; null for the organization and for user. */
  readonly getParent = (entityType: string): TChannels | null => {
    const entry = this.entities.get(entityType);
    return entry && entry.kind !== 'user' ? (entry.parent as TChannels | null) : null;
  };

  /** Most-specific to organization: task gives ['project', 'organization']. */
  readonly getOrderedAncestors = (entityType: string): readonly TChannels[] => {
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
  };

  /** Non-ancestor channels from `relatedChannels`, mapping to nullable id columns. */
  readonly getRelatedChannels = (entityType: string): readonly TChannels[] => {
    const entry = this.entities.get(entityType);
    if (!entry || entry.kind === 'user') return [];
    return (entry.relatedChannels ?? []) as readonly TChannels[];
  };

  /** Ancestors a product may attach above, mapping to nullable id columns. */
  readonly getNullableAncestors = (entityType: string): readonly TChannels[] => {
    const entry = this.entities.get(entityType);
    if (entry?.kind !== 'product') return [];
    return (entry.nullableAncestors ?? []) as readonly TChannels[];
  };

  readonly getConfig = (entityType: string): EntityView | undefined => {
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
  };

  readonly getProductConfig = (entityType: string): ProductView | undefined => {
    const config = this.getConfig(entityType);
    return config?.kind === 'product' ? config : undefined;
  };

  readonly getChannelConfig = (entityType: string): ChannelView<RoleFromRegistry<TRoles>> | undefined => {
    const config = this.getConfig(entityType);
    return config?.kind === 'channel' ? (config as ChannelView<RoleFromRegistry<TRoles>>) : undefined;
  };

  readonly hasAncestor = (entityType: string, ancestor: string): boolean => {
    return this.getOrderedAncestors(entityType).includes(ancestor as TChannels);
  };

  readonly getChildren = (channelType: string): readonly (TChannels | TProducts)[] => {
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
  };

  /** Breadth-first. */
  readonly getOrderedDescendants = (channelType: string): readonly (TChannels | TProducts)[] => {
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
  };

  get roles(): TRoles {
    return this.roleRegistry;
  }

  // Row location: id-column naming, home attribution and path computation. The instance is the
  // entry point; `resolve-row-channel.ts` and `row-path.ts` hold the implementations and also
  // export them as free functions over `AncestorSource` for injected hierarchies.

  readonly idColumnKey = (entityType: string): string => {
    return entityIdColumnKey(entityType);
  };

  /** `courseSection` gives `course_section_id`. */
  readonly idColumnName = (entityType: string): string => {
    return entityIdColumnName(entityType);
  };

  readonly resolveNonNullAncestors = (entityType: string, row: Record<string, unknown>): ResolvedAncestor[] => {
    return resolveNonNullAncestors(this, entityType, row);
  };

  readonly resolveDeepestAncestorId = (entityType: string, row: Record<string, unknown>): string | null => {
    return resolveDeepestAncestorId(this, entityType, row);
  };

  readonly possibleHomeChannels = (entityType: string): string[] => {
    return possibleHomeChannels(this, entityType);
  };

  readonly computeAncestorPath = (entityType: string, row: Record<string, unknown>): string | null => {
    return computeAncestorPath(this, entityType, row);
  };

  readonly computeProductPath = (entityType: string, row: Record<string, unknown>): string | null => {
    return computeProductPath(this, entityType, row);
  };

  readonly computeChannelPath = (entityType: string, row: Record<string, unknown>): string | null => {
    return computeChannelPath(this, entityType, row);
  };

  /** Channel tables store this expression as a generated column (`appendOwnId` true). */
  readonly pathColumnSql = (entityType: string, appendOwnId: boolean): string => {
    return pathColumnSql(this, entityType, appendOwnId);
  };

  readonly deepestAncestorSql = (entityType: string, alias: string): string | null => {
    return deepestAncestorSql(this, entityType, alias);
  };
}

export function createEntityHierarchy<R extends { all: readonly string[] }>(
  roles: R,
): EntityHierarchyBuilder<R, never, never> {
  return new EntityHierarchyBuilder(roles);
}
