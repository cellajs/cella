/**
 * LRU caches for CDC enrichment data.
 * Uses lru-cache package for battle-tested LRU + TTL implementation.
 */

import { LRUCache } from 'lru-cache';

/** User info cache entry type */
interface UserCacheEntry {
  id: string;
  name: string | null;
  email: string;
  thumbnailUrl: string | null;
}

/** Entity info cache entry type */
interface EntityCacheEntry {
  id: string;
  name: string;
  slug: string;
  thumbnailUrl: string | null;
  entityType: string;
}

/** Cache for user info (30 second TTL, max 500 entries) */
export const userCache = new LRUCache<string, UserCacheEntry>({
  max: 500,
  ttl: 30_000,
});

/** Cache for entity info (30 second TTL, max 500 entries) */
export const entityCache = new LRUCache<string, EntityCacheEntry>({
  max: 500,
  ttl: 30_000,
});
