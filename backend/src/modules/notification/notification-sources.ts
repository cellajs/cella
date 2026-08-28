import type { TrackedEventType } from 'shared';
import type { ModuleNotifications } from '#/lib/module';
import { onBackendModuleRegister } from '#/lib/module';
import { registerMutationHandler } from '#/lib/mutation-bus';
import { log } from '#/utils/logger';
import { deriveMentionsFor } from './operations/derive-mentions';

/**
 * Index of `notifications` declarations from backend modules, keyed by product entity type. Filled
 * through `onBackendModuleRegister`, which replays modules registered before this file loaded, so
 * import order does not matter. Empty when no module declares a source: the whole notification
 * machinery is then dormant.
 */
const sources = new Map<string, ModuleNotifications>();

onBackendModuleRegister((module) => {
  if (!module.notifications) return;
  if (!module.productEntity) {
    log.error('Module declares notifications without productEntity; declaration ignored', { module: module.name });
    return;
  }
  sources.set(module.productEntity, module.notifications);

  // Mentions derive in the writing transaction, so the stored `mentions` column is server-owned.
  if (module.notifications.mentionable) {
    for (const action of ['created', 'updated'] as const) {
      registerMutationHandler(
        `${module.productEntity}.${action}` as TrackedEventType,
        deriveMentionsFor(module.productEntity, module.notifications),
      );
    }
  }
});

export const getNotificationSource = (entityType: string): ModuleNotifications | undefined => sources.get(entityType);

export const getNotificationSourceTypes = (): string[] => [...sources.keys()];
