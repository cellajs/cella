import { appConfig, type ChannelEntityType, isChannel, isProduct, type ProductEntityType } from 'shared';
import { onFrontendModuleRegister } from '~/lib/module';
import type { IconComponent } from '~/modules/common/icons/types';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';
import type { ChannelListQueryFactory, ChannelListQueryMap } from '~/query/types';

/**
 * A channel entity's frontend wiring, declared by the module that owns the entity: an app adding a
 * channel fills in its own `<name>-module.tsx` and edits no central map.
 */
export interface ChannelModuleConfig {
  entityType: ChannelEntityType;
  /** Menu sheet section for this channel; a channel without one stays out of the menu. */
  menuSection?: Omit<MenuSectionOptions, 'entityType'>;
  /**
   * List query behind the menu, the search sheet and parent pickers. Wrap the factory in an arrow so
   * the (ESM live) binding is read at call time: a direct reference throws "Cannot access X before
   * initialization" when the module file evaluates mid-cycle, for example during Vite HMR before the
   * entity query module has initialized.
   */
  listQuery?: ChannelListQueryFactory;
  /** Keeps this channel's member-count column out of the members table until a user toggles it on. */
  hiddenMemberCount?: boolean;
}

/** A product entity's frontend wiring, declared by the module that owns the entity. */
export interface ProductModuleConfig {
  entityType: ProductEntityType;
  /** Icon of this product's per-member stat column, shown when `appConfig.memberStatProductTypes` lists the type. */
  memberStatIcon?: IconComponent;
  /** Keeps this product's member-count column out of the members table until a user toggles it on. */
  hiddenMemberCount?: boolean;
  /**
   * Search param that opens one of these rows on the page that lists them: a sheet, a dialog, a
   * pinned row. A notification deep link sets it to the subject's id; the module that declares it
   * also declares it in that page's `validateSearch`, or the router strips it.
   */
  deepLinkParam?: string;
  /** Product that hosts this one on screen (a comment in its item); a deep link opens that host, at the notification's context id. */
  deepLinkHost?: ProductEntityType;
}

const channels = new Map<ChannelEntityType, ChannelModuleConfig>();
const products = new Map<ProductEntityType, ProductModuleConfig>();
/** Resolved once at registration: the menu sheet holds the section as a prop, so its identity stays put. */
const menuSections = new Map<ChannelEntityType, MenuSectionOptions>();
const hiddenMemberCounts = new Set<string>();
let listQueries: ChannelListQueryMap | null = null;

onFrontendModuleRegister(({ name, channel, product }) => {
  if (channel) {
    if (!isChannel(channel.entityType))
      throw new Error(`Module '${name}' declares channel '${channel.entityType}', which is no channel in the hierarchy`);
    channels.set(channel.entityType, channel);
    if (channel.menuSection) menuSections.set(channel.entityType, { ...channel.menuSection, entityType: channel.entityType });
    listQueries = null;
  }
  if (product) {
    if (!isProduct(product.entityType))
      throw new Error(`Module '${name}' declares product '${product.entityType}', which is no product in the hierarchy`);
    products.set(product.entityType, product);
  }
  const entity = channel ?? product;
  if (entity?.hiddenMemberCount) hiddenMemberCounts.add(entity.entityType);
});

/** The channel's menu sheet section, undefined when its module declares none. */
export const getMenuSection = (entityType: ChannelEntityType): MenuSectionOptions | undefined => menuSections.get(entityType);

/** The channel's list query factory, undefined when its module declares none. */
export const getChannelListQuery = (entityType: ChannelEntityType): ChannelListQueryFactory | undefined => channels.get(entityType)?.listQuery;

/**
 * Every declared channel list query, keyed by entity type in `appConfig.channelEntityTypes` order.
 * The search sheet calls one hook per entry, so both the order and the map's identity hold between
 * renders; registration happens before first render and rebuilds the map when it does.
 */
export function getChannelListQueries(): ChannelListQueryMap {
  if (listQueries) return listQueries;
  const map: ChannelListQueryMap = {};
  for (const entityType of appConfig.channelEntityTypes) {
    const listQuery = channels.get(entityType)?.listQuery;
    if (listQuery) map[entityType] = listQuery;
  }
  listQueries = map;
  return map;
}

/**
 * The search params that open this product: its own, and the one of the product that hosts it on
 * screen. A deep link may send both, since a route that declares neither strips both.
 */
export function getProductDeepLink(entityType: ProductEntityType): { param?: string; hostParam?: string } {
  const product = products.get(entityType);
  const host = product?.deepLinkHost;
  return { param: product?.deepLinkParam, hostParam: host ? products.get(host)?.deepLinkParam : undefined };
}

/** Icon for a product's per-member stat column; the members table falls back to a generic one. */
export const getMemberStatIcon = (entityType: ProductEntityType): IconComponent | undefined => products.get(entityType)?.memberStatIcon;

/** Whether this entity's `${type}Count` column starts hidden in the members table. */
export const isMemberCountHidden = (entityType: string): boolean => hiddenMemberCounts.has(entityType);
