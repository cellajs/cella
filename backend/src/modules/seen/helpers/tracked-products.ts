import { appConfig, hierarchy, type SeenTrackedProductType } from 'shared';

const trackedProductTypeSet = new Set<string>(appConfig.seenTrackedProductTypes);

/** Whether seen marks and unseen counts track the product type (`appConfig.seenTrackedProductTypes`). */
export function isTrackedProductType(productType: string): productType is SeenTrackedProductType {
  return trackedProductTypeSet.has(productType);
}

/** Channel types that group unseen counts: every possible home channel of a tracked row. */
export const groupingChannelTypes = new Set(appConfig.seenTrackedProductTypes.flatMap((type) => hierarchy.possibleHomeChannels(type)));
