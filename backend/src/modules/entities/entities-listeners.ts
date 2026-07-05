import { appConfig, hasParentEntity, hierarchy } from 'shared';
import { activityBus } from '#/lib/activity-bus';
import { publicEntityCache } from '#/middlewares/entity-cache';
import { dispatchToAppStream, dispatchToPublicStream } from '#/modules/entities/helpers/dispatch-to-stream';
import { log } from '#/utils/logger';
import type { AppStreamEvent, PublicStreamEvent } from './stream/types';

/**
 * Activity bus listeners for entity changes.
 *
 * - Product entity & membership events are dispatched to authenticated SSE subscribers.
 * - Public entity events invalidate the entity cache and are dispatched to public SSE subscribers.
 */

// Listen for product entity changes (skip parentless types like page — they use public stream only)
for (const entityType of appConfig.productEntityTypes) {
  if (!hasParentEntity(entityType)) continue;
  for (const action of ['created', 'updated', 'deleted'] as const) {
    activityBus.on(`${entityType}.${action}`, async (event) => {
      if (!event.subjectId || !event.organizationId) return;
      try {
        await dispatchToAppStream(event as AppStreamEvent);
      } catch (error) {
        log.error('Failed to dispatch entity change event', { error, activityId: event.id });
      }
    });
  }
}

// Listen for membership changes
for (const action of ['created', 'updated', 'deleted'] as const) {
  activityBus.on(`membership.${action}`, async (event) => {
    if (!event.organizationId) return;
    try {
      await dispatchToAppStream(event as AppStreamEvent);
    } catch (error) {
      log.error('Failed to dispatch entity change event', { error, activityId: event.id });
    }
  });
}

// Listen for public product entity changes
for (const entityType of hierarchy.publicStreamTypes) {
  for (const action of ['created', 'updated', 'deleted'] as const) {
    activityBus.on(`${entityType}.${action}`, async (event) => {
      if (!event.subjectId) return;
      publicEntityCache.delete(entityType, event.subjectId);
      try {
        await dispatchToPublicStream(event as PublicStreamEvent);
      } catch (error) {
        log.error('Failed to dispatch public entity event', { error, activityId: event.id });
      }
    });
  }
}
