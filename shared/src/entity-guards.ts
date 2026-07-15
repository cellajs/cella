import { hierarchy } from '../config/config.default';
import type { ChannelEntityType, ProductEntityType } from '../types';

/** Get roles for a channel entity. */
export function getChannelRoles(channelType: string): readonly string[] {
  return hierarchy.getRoles(channelType);
}

/** Check if entity type is a channel entity (type guard). */
export function isChannelEntity(entityType: string): entityType is ChannelEntityType {
  return hierarchy.isChannel(entityType);
}

/** Check if entity type is a product entity (type guard). */
export function isProductEntity(entityType: string | null | undefined): entityType is ProductEntityType {
  return !!entityType && hierarchy.isProduct(entityType);
}

