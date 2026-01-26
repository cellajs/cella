/**
 * Membership enrichment queries.
 * Fetches user and entity data for membership CDC events with LRU caching.
 */

import { eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import { entityCache, userCache } from './cache';
import type { EnrichedMembershipData, EntityInfo, UserInfo } from './types';

/**
 * Enrich a membership row with user and entity data.
 * Uses LRU cache to minimize database queries.
 */
export async function enrichMembershipData(
  row: Record<string, unknown>,
): Promise<EnrichedMembershipData> {
  const userId = row.userId as string;
  const organizationId = row.organizationId as string;
  const contextType = row.contextType as string;

  // Parallel fetch with caching
  const [user, entity] = await Promise.all([
    getCachedUser(userId),
    getCachedEntity(contextType, organizationId),
  ]);

  return { user, entity };
}

/**
 * Get user info with cache lookup.
 */
async function getCachedUser(userId: string): Promise<UserInfo | null> {
  // Check cache first
  const cached = userCache.get(userId);
  if (cached) return cached;

  // Fetch from database
  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      thumbnailUrl: usersTable.thumbnailUrl,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (user) {
    userCache.set(userId, user);
  }

  return user ?? null;
}

/**
 * Get entity info with cache lookup.
 * Currently supports organization context type.
 */
async function getCachedEntity(
  contextType: string,
  entityId: string,
): Promise<EntityInfo | null> {
  // Build cache key from context type and entity ID
  const cacheKey = `${contextType}:${entityId}`;

  // Check cache first
  const cached = entityCache.get(cacheKey);
  if (cached) return cached;

  // Fetch based on context type
  let entity: EntityInfo | null = null;

  if (contextType === 'organization') {
    const [org] = await db
      .select({
        id: organizationsTable.id,
        name: organizationsTable.name,
        slug: organizationsTable.slug,
        thumbnailUrl: organizationsTable.thumbnailUrl,
      })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, entityId))
      .limit(1);

    if (org) {
      entity = { ...org, entityType: 'organization' };
    }
  }

  // Extend here for other context types (e.g., project, team)
  // if (contextType === 'project') { ... }

  if (entity) {
    entityCache.set(cacheKey, entity);
  }

  return entity;
}
