import { hierarchy } from '../config/config.default.ts';
import type { SeenTrackedProductType } from '../types.ts';
import { appConfig } from './config-builder/app-config.ts';

const seenTrackedTypes = new Set<string>(appConfig.seenTrackedProductTypes);

/** Whether seen marks and unseen counts track the product type (`appConfig.seenTrackedProductTypes`). */
export const isSeenTracked = (type: string): type is SeenTrackedProductType => seenTrackedTypes.has(type);

/** Channel types that group unseen counts: every possible home channel of a tracked row. */
export const seenGroupingChannelTypes = new Set(appConfig.seenTrackedProductTypes.flatMap((type) => hierarchy.possibleHomeChannels(type)));
