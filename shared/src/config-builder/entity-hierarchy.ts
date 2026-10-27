import { entityIdColumnKey, entityIdColumnName, type ResolvedAncestor } from './resolve-row-channel.ts';

type RoleRegistry<T extends readonly string[]> = { readonly all: T } & { readonly [K in T[number]]: K };

export function createRoleRegistry<const T extends readonly string[]>(roleNames: T): RoleRegistry<T> {
  return Object.freeze({ all: roleNames, ...Object.fromEntries(roleNames.map((role) => [role, role])) }) as RoleRegistry<T>;
}

export type RoleFromRegistry<R extends { all: readonly string[] }> = R['all'][number];

/** The roles a channel declared, or every registry role for a type the map does not name. */
export type ChannelRole<TRoleMap, TRoles extends { all: readonly string[] }, T extends string> = T extends keyof TRoleMap
  ? TRoleMap[T]
  : RoleFromRegistry<TRoles>;

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
  /** Present when the channel can start as a draft; see {@link ChannelDrafts}. */
  drafts?: ChannelDrafts;
}
/**
 * A draft channel shows to its own members and holds its invitations until it is published, except
 * those for `prepareRoles`, who are invited at once to set it up.
 */
interface ChannelDrafts<R extends string = string> {
  prepareRoles: readonly R[];
}
interface ProductEntry {
  kind: 'product';
  parent: string;
  relatedChannels?: readonly string[];
  /** Ancestors whose id columns are nullable: rows may attach above the declared parent. */
  nullableAncestors?: readonly string[];
}
type EntityEntry = UserEntry | ChannelEntry | ProductEntry;

/** Chain calls to declare entities, then call build(). @see README.md */
class EntityHierarchyBuilder<
  TRoles extends { all: readonly string[] },
  TChannels extends string = never,
  TProducts extends string = never,
  TParentMap extends Record<string, string | null> = Record<never, never>,
  TRelatedMap extends Record<string, string> = Record<never, never>,
  TNullableMap extends Record<string, string> = Record<never, never>,
  TRoleMap extends Record<string, string> = Record<never, never>,
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
  user(): EntityHierarchyBuilder<TRoles, TChannels, TProducts, TParentMap, TRelatedMap, TNullableMap, TRoleMap> {
    if (this.entities.has('user')) throw new Error('EntityHierarchy: user() can only be called once');
    return new EntityHierarchyBuilder<TRoles, TChannels, TProducts, TParentMap, TRelatedMap, TNullableMap, TRoleMap>(
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
    /** Lets an organization start as a draft; see {@link channel}. */
    drafts?: ChannelDrafts<RO[number]>;
  }): EntityHierarchyBuilder<
    TRoles,
    TChannels | 'organization',
    TProducts,
    TParentMap & { organization: null },
    TRelatedMap,
    TNullableMap,
    TRoleMap & { organization: RO[number] }
  > {
    this.validateName('organization');
    this.validateRoles('organization', options.roles);
    this.validateElevated('organization', options.roles, options.elevated);
    this.validateDrafts('organization', options.roles, options.drafts);
    return new EntityHierarchyBuilder<
      TRoles,
      TChannels | 'organization',
      TProducts,
      TParentMap & { organization: null },
      TRelatedMap,
      TNullableMap,
      TRoleMap & { organization: RO[number] }
    >(
      this.roles,
      this.withEntity('organization', {
        kind: 'channel',
        parent: null,
        roles: options.roles,
        elevated: options.elevated,
        drafts: options.drafts,
      }),
    );
  }

  /** A channel below the organization (`parent` is the organization or a channel under it). */
  channel<N extends string, P extends TChannels, const RO extends readonly RoleFromRegistry<TRoles>[], const RC extends readonly TChannels[] = []>(
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
      /**
       * Lets the channel start as a draft. Invitations for `prepareRoles` go out at once, so those
       * people can set it up; the rest wait until it is published.
       */
      drafts?: ChannelDrafts<RO[number]>;
    },
  ): EntityHierarchyBuilder<
    TRoles,
    TChannels | N,
    TProducts,
    TParentMap & { [K in N]: P },
    TRelatedMap & { [K in N]: RC[number] },
    TNullableMap,
    TRoleMap & { [K in N]: RO[number] }
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
    this.validateDrafts(name, options.roles, options.drafts);
    return new EntityHierarchyBuilder<
      TRoles,
      TChannels | N,
      TProducts,
      TParentMap & { [K in N]: P },
      TRelatedMap & { [K in N]: RC[number] },
      TNullableMap,
      TRoleMap & { [K in N]: RO[number] }
    >(
      this.roles,
      this.withEntity(name, {
        kind: 'channel',
        parent: options.parent,
        roles: options.roles,
        relatedChannels: options.relatedChannels,
        organizationRoles: options.organizationRoles as Readonly<Record<string, string>> | undefined,
        elevated: options.elevated,
        drafts: options.drafts,
      }),
    );
  }

  /** At least one prepare role, each one of the channel's own: a draft nobody can be invited to prepare stays empty. */
  private validateDrafts(name: string, roles: readonly string[], drafts?: ChannelDrafts): void {
    if (!drafts) return;
    if (drafts.prepareRoles.length === 0) throw new Error(`EntityHierarchy: channel "${name}" declares drafts without prepareRoles`);
    for (const role of drafts.prepareRoles) {
      if (!roles.includes(role)) {
        throw new Error(`EntityHierarchy: channel "${name}" lists unknown prepare role "${role}". Own roles: ${roles.join(', ')}`);
      }
    }
  }

  /** Each elevated role must be one of the channel's own roles. */
  private validateElevated(name: string, roles: readonly string[], elevated?: readonly string[]): void {
    if (!elevated) return;
    for (const role of elevated) {
      if (!roles.includes(role)) {
        throw new Error(`EntityHierarchy: channel "${name}" elevates unknown role "${role}". Own roles: ${roles.join(', ')}`);
      }
    }
  }

  /** Keys must be this channel's own roles; values must be organization roles. */
  private validateOrganizationRoles(name: string, roles: readonly string[], organizationRoles?: Partial<Record<string, string>>): void {
    if (!organizationRoles) return;

    // organization() runs before any channel(), so the vocabulary is known here.
    const organization = this.entities.get('organization');
    const organizationVocabulary = organization?.kind === 'channel' ? organization.roles : [];

    for (const [role, organizationRole] of Object.entries(organizationRoles)) {
      if (!roles.includes(role)) {
        throw new Error(`EntityHierarchy: channel "${name}" maps unknown role "${role}" in organizationRoles. Own roles: ${roles.join(', ')}`);
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
  product<N extends string, P extends TChannels, const RC extends readonly TChannels[] = [], const NA extends readonly TChannels[] = []>(
    name: N,
    options: { parent: P; relatedChannels?: RC; nullableAncestors?: NA },
  ): EntityHierarchyBuilder<
    TRoles,
    TChannels,
    TProducts | N,
    TParentMap & { [K in N]: P },
    TRelatedMap & { [K in N]: RC[number] },
    TNullableMap & { [K in N]: NA[number] },
    TRoleMap
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
      TNullableMap & { [K in N]: NA[number] },
      TRoleMap
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

  build(): EntityHierarchy<TRoles, TChannels, TProducts, TParentMap, TRelatedMap, TNullableMap, TRoleMap> {
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
      throw new Error(`EntityHierarchy: ${kind} "${name}" has no parent. Only the organization is parentless; every other entity nests under it.`);
    }

    const parentEntry = this.entities.get(parent);
    if (!parentEntry) {
      throw new Error(`EntityHierarchy: ${kind} "${name}" references unknown parent "${parent}". Parents must be defined before children.`);
    }
    if (parentEntry.kind !== 'channel') {
      throw new Error(`EntityHierarchy: ${kind} "${name}" parent "${parent}" must be a channel entity, but it is a ${parentEntry.kind} entity.`);
    }
  }

  private validateRoles(name: string, roles: readonly string[]): void {
    if (roles.length === 0) {
      throw new Error(`EntityHierarchy: channel "${name}" must have at least one role`);
    }

    const validRoles = new Set(this.roles.all);
    for (const role of roles) {
      if (!validRoles.has(role)) {
        throw new Error(`EntityHierarchy: channel "${name}" has invalid role "${role}". Valid roles: ${[...validRoles].join(', ')}`);
      }
    }
  }

  /** The strict chain from `parent` up to the organization, as declared so far. */
  private ancestorChain(parent: string): string[] {
    const chain: string[] = [];
    for (let current: string | null = parent; current !== null; ) {
      chain.push(current);
      const entry = this.entities.get(current);
      current = entry && entry.kind !== 'user' ? entry.parent : null;
    }
    return chain;
  }

  /** Each must be an already-defined channel, outside the strict ancestor chain, not itself. */
  private validateRelatedChannels(name: string, parent: string, relatedChannels?: readonly string[]): void {
    if (!relatedChannels?.length) return;

    const ancestors = new Set(this.ancestorChain(parent));
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
        throw new Error(`EntityHierarchy: entity "${name}" relatedChannel "${related}" must be a channel entity, but it is a ${entry.kind} entity.`);
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

    const chain = this.ancestorChain(parent);
    const seen = new Set<string>();
    for (const ancestor of nullableAncestors) {
      if (seen.has(ancestor)) {
        throw new Error(`EntityHierarchy: product "${name}" has duplicate nullableAncestor "${ancestor}"`);
      }
      seen.add(ancestor);

      if (!chain.includes(ancestor)) {
        throw new Error(
          `EntityHierarchy: product "${name}" nullableAncestor "${ancestor}" is not an ancestor. Ancestor chain: ${chain.join(' > ')}.`,
        );
      }
      if (ancestor === 'organization') {
        throw new Error(`EntityHierarchy: product "${name}" nullableAncestor "${ancestor}" is the organization and must stay non-null.`);
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
  TRoleMap extends Record<string, string> = Record<string, string>,
> {
  /** Phantom carriers, type-only with no runtime value: strict parent (null = organization), related
   * (non-ancestor) channel union, per-product nullable-ancestor union, and per-channel role union. */
  declare readonly _parentMap: TParentMap;
  declare readonly _relatedMap: TRelatedMap;
  declare readonly _nullableMap: TNullableMap;
  declare readonly _roleMap: TRoleMap;

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
  readonly getRoles = <T extends string>(channelType: T): readonly ChannelRole<TRoleMap, TRoles, T>[] => {
    const entry = this.entities.get(channelType);
    return entry?.kind === 'channel' ? (entry.roles as readonly ChannelRole<TRoleMap, TRoles, T>[]) : [];
  };

  /**
   * Roles are declared most to least privileged, so the last role is a channel's floor: the invite
   * default, the auto-created associated-membership fallback and the membership column default.
   * Apps with other vocabularies (`guest`, `student`) get their own floor; throws for non-channels.
   */
  readonly getLeastPrivilegedRole = <T extends string>(channelType: T): ChannelRole<TRoleMap, TRoles, T> => {
    const roles = this.getRoles(channelType);
    const role = roles[roles.length - 1];
    if (!role) throw new Error(`Entity type '${channelType}' is not a channel or declares no roles`);
    return role;
  };

  /** The first declared role of a channel; see {@link getLeastPrivilegedRole} for the ordering rule. */
  readonly getMostPrivilegedRole = <T extends string>(channelType: T): ChannelRole<TRoleMap, TRoles, T> => {
    const role = this.getRoles(channelType)[0];
    if (!role) throw new Error(`Entity type '${channelType}' is not a channel or declares no roles`);
    return role;
  };

  /** True when the channel declares `drafts`, so it can be created unpublished. */
  readonly canDraft = (channelType: string): boolean => {
    const entry = this.entities.get(channelType);
    return entry?.kind === 'channel' && !!entry.drafts;
  };

  /** Roles invited at once while the channel is a draft; empty when it declares no `drafts`. */
  readonly getPrepareRoles = <T extends string>(channelType: T): readonly ChannelRole<TRoleMap, TRoles, T>[] => {
    const entry = this.entities.get(channelType);
    return entry?.kind === 'channel' ? ((entry.drafts?.prepareRoles ?? []) as readonly ChannelRole<TRoleMap, TRoles, T>[]) : [];
  };

  /**
   * Explicit organization role a membership role escalates to when it auto-creates the
   * organization membership row; undefined when the channel declares no mapping for it
   * (insertMemberships treats that as a programming error and throws).
   */
  readonly getOrganizationRole = (channelType: string, role: string): ChannelRole<TRoleMap, TRoles, 'organization'> | undefined => {
    const entry = this.entities.get(channelType);
    if (entry?.kind !== 'channel') return undefined;
    return entry.organizationRoles?.[role] as ChannelRole<TRoleMap, TRoles, 'organization'> | undefined;
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
    for (let current = this.getParent(entityType); current !== null; current = this.getParent(current)) ancestors.push(current);

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

  // Row location: home attribution and path computation. The home and the path read a row's
  // ancestor ids through `resolveNonNullAncestors`, so they agree by construction.

  /** All non-null ancestors of a row, most-specific → root. */
  readonly resolveNonNullAncestors = (entityType: string, row: Record<string, unknown>): ResolvedAncestor[] => {
    const ancestors: ResolvedAncestor[] = [];
    for (const type of this.getOrderedAncestors(entityType)) {
      const idColumn = entityIdColumnKey(type);
      const id = row[idColumn];
      if (typeof id === 'string' && id) ancestors.push({ type, idColumn, id });
    }
    return ancestors;
  };

  /** The row's effective home context id: deepest non-null ancestor. Null when every ancestor id is null. */
  readonly resolveDeepestAncestorId = (entityType: string, row: Record<string, unknown>): string | null =>
    this.resolveNonNullAncestors(entityType, row)[0]?.id ?? null;

  /**
   * Homes under the deepest-non-null rule: the declared parent, plus each further ancestor while
   * everything below it is nullable. A row never attaches above a non-nullable ancestor.
   */
  readonly possibleHomeChannels = (entityType: string): string[] => {
    const nullable = new Set(this.getNullableAncestors(entityType));
    const homes: string[] = [];
    for (const ancestor of this.getOrderedAncestors(entityType)) {
      homes.push(ancestor);
      if (!nullable.has(ancestor)) break;
    }
    return homes;
  };

  /** Organization-first path from the populated ancestor ids. Null when the organization id is missing. */
  readonly computeAncestorPath = (entityType: string, row: Record<string, unknown>): string | null => {
    const ancestors = this.resolveNonNullAncestors(entityType, row);
    // A row without the organization id has no addressable subtree.
    if (ancestors.at(-1)?.type !== 'organization') return null;
    return ancestors
      .map(({ id }) => id)
      .reverse()
      .join('/');
  };

  /** A product row's path: its non-null ancestor chain. */
  readonly computeProductPath = (entityType: string, row: Record<string, unknown>): string | null => this.computeAncestorPath(entityType, row);

  /** A channel row's ancestor chain plus its own id; for the organization, just its own id. */
  readonly computeChannelPath = (entityType: string, row: Record<string, unknown>): string | null => {
    const id = row.id;
    if (typeof id !== 'string' || !id) return null;
    if (this.getOrderedAncestors(entityType).length === 0) return id;
    const ancestors = this.computeAncestorPath(entityType, row);
    return ancestors === null ? null : `${ancestors}/${id}`;
  };

  /**
   * SQL twin of {@link computeAncestorPath} / {@link computeChannelPath}, kept adjacent and held
   * identical by the path parity tests. Produces the generated-column expression
   * `"organization_id"::text || COALESCE('/' || "course_id"::text, '') || ...`, appending
   * `'/' || "id"::text` when `appendOwnId` (channel entities). It updates atomically on
   * reparenting, skips nullable intermediate ancestors, and requires a non-null organization.
   * Channel tables store this expression as a generated column (`appendOwnId` true).
   */
  readonly pathColumnSql = (entityType: string, appendOwnId: boolean): string => {
    const [root, ...deeper] = [...this.getOrderedAncestors(entityType)].reverse();
    if (root === undefined) return `"id"::text`;

    const parts = [`"${entityIdColumnName(root)}"::text`];
    for (const ancestor of deeper) {
      parts.push(`COALESCE('/' || "${entityIdColumnName(ancestor)}"::text, '')`);
    }
    if (appendOwnId) parts.push(`'/' || "id"::text`);
    return parts.join(' || ');
  };

  /** SQL twin of {@link resolveDeepestAncestorId}. Null when the entity has no ancestors. */
  readonly deepestAncestorSql = (entityType: string, alias: string): string | null => {
    const ancestors = this.getOrderedAncestors(entityType);
    if (!ancestors.length) return null;
    return `COALESCE(${ancestors.map((ancestor) => `${alias}.${entityIdColumnName(ancestor)}`).join(', ')})`;
  };
}

export function createEntityHierarchy<R extends { all: readonly string[] }>(roles: R): EntityHierarchyBuilder<R, never, never> {
  return new EntityHierarchyBuilder(roles);
}
