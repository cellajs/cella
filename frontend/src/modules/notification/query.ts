import { queryOptions, useMutation } from '@tanstack/react-query';
import {
  type CreatePushSubscriptionData,
  createPushSubscription,
  deletePushSubscription,
  getNotificationPreferences,
  getNotifications,
  getPushVapid,
  markNotificationsRead,
  type UpdateNotificationPreferencesData,
  updateNotificationPreferences,
} from 'sdk';
import { queryClient } from '~/query/query-client';

export const notificationKeys = {
  list: ['me', 'notifications'] as const,
  preferences: ['me', 'notification-preferences'] as const,
};

/**
 * Reconciled query: the server response is authoritative and this key is what freshness signals
 * invalidate. `sync-listener` supplies liveness, so there is no polling timer.
 */
export const notificationsQueryOptions = () =>
  queryOptions({
    queryKey: notificationKeys.list,
    queryFn: () => getNotifications({ query: { limit: 30 } }),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

export const invalidateNotifications = () => queryClient.invalidateQueries({ queryKey: notificationKeys.list });

/** Patches the cache so the badge reacts immediately; the `onSettled` refetch is the rollback. */
export const useMarkNotificationsRead = () =>
  useMutation({
    mutationFn: (body: { ids?: string[]; contextId?: string }) => markNotificationsRead({ body }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.list });
      const previous = queryClient.getQueryData<Awaited<ReturnType<typeof getNotifications>>>(notificationKeys.list);
      if (!previous) return;

      const readAt = new Date().toISOString();
      const shouldMark = (item: (typeof previous.items)[number]) => {
        if (body.contextId) return item.contextId === body.contextId;
        if (body.ids?.length) return body.ids.includes(item.id);
        return true;
      };

      const items = previous.items.map((item) => (item.readAt || !shouldMark(item) ? item : { ...item, readAt }));
      queryClient.setQueryData(notificationKeys.list, {
        ...previous,
        items,
        unreadCount: items.filter((item) => !item.readAt).length,
      });
    },
    onSettled: () => invalidateNotifications(),
  });

export const notificationPreferencesQueryOptions = () =>
  queryOptions({
    queryKey: notificationKeys.preferences,
    queryFn: () => getNotificationPreferences(),
  });

/** Partial update: the server merges per key, so an older tab cannot clobber a preference it never knew. */
export const useUpdateNotificationPreferences = () =>
  useMutation({
    mutationFn: (body: UpdateNotificationPreferencesData['body']) => updateNotificationPreferences({ body }),
    onSuccess: (updated) => queryClient.setQueryData(notificationKeys.preferences, updated),
  });

// Imperative push-subscription calls for use-push-subscription.ts; not queries, so no cache keys.
export const fetchPushVapid = () => getPushVapid();
export const registerPushSubscription = (body: CreatePushSubscriptionData['body']) => createPushSubscription({ body });
export const removePushSubscription = (endpoint: string) => deletePushSubscription({ query: { endpoint } });
