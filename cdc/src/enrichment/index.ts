/**
 * CDC enrichment module.
 * Provides entity/user data enrichment for CDC events.
 */

export { enrichMembershipData } from './membership';
export { entityCache, userCache } from './cache';
export type { EnrichedMembershipData, EntityInfo, UserInfo } from './types';
