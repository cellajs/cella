import { queryOptions, useMutation } from '@tanstack/react-query';
import {
  type CreatePushSubscriptionData,
  createPushSubscription,
  deletePushSubscription,
  type GetNotificationsResponse,
  getNotificationPreferences,
  getNotifications,
  getPushVapid,
  markNotificationsRead,
  resubscribeNotifications,
  type UnsubscribeNotificationsData,
  type UpdateNotificationPreferencesData,
  unsubscribeNotifications,
  updateNotificationPreferences,
} from 'sdk';
import type { ApiError } from '~/lib/api';
import { queryClient } from '~/query/query-client';

export const notificationKeys = { list: ['me', 'notifications'] as const, preferences: ['me', 'notification-preferences'] as const };

/** Each fetch replaces the cached list whole; `sync-listener` invalidates this key on change events, so nothing polls. */
export const notificationsQueryOptions = () =>
  queryOptions({
    queryKey: notificationKeys.list,
    queryFn: () => getNotifications({ query: { limit: 30 } }),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

export const invalidateNotifications = () => queryClient.invalidateQueries({ queryKey: notificationKeys.list });

/** Patches the cache so the badge reacts immediately; the `onSettled` refetch is the rollback. */
export const useMarkNotificationsReadMutation = () =>
  useMutation({
    mutationFn: (body: { ids?: string[]; contextId?: string }) => markNotificationsRead({ body }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.list });
      const previous = queryClient.getQueryData<GetNotificationsResponse>(notificationKeys.list);
      if (!previous) return;

      const readAt = new Date().toISOString();
      const shouldMark = (item: GetNotificationsResponse['items'][number]) => {
        if (body.contextId) return item.contextId === body.contextId;
        if (body.ids?.length) return body.ids.includes(item.id);
        return true;
      };

      const items = previous.items.map((item) => (item.readAt || !shouldMark(item) ? item : { ...item, readAt }));
      const unreadCount = items.filter((item) => !item.readAt).length;
      queryClient.setQueryData(notificationKeys.list, { ...previous, items, unreadCount });
    },
    onSettled: () => invalidateNotifications(),
  });

export const notificationPreferencesQueryOptions = () =>
  queryOptions({ queryKey: notificationKeys.preferences, queryFn: () => getNotificationPreferences() });

/** Partial update: the server merges per key, so an older tab cannot clobber a preference it never knew. */
export const useUpdateNotificationPreferencesMutation = () =>
  useMutation({
    mutationFn: (body: UpdateNotificationPreferencesData['body']) => updateNotificationPreferences({ body }),
    onSuccess: (updated) => queryClient.setQueryData(notificationKeys.preferences, updated),
  });

// Imperative push-subscription calls for use-push-subscription.ts; not queries, so no cache keys.
/** Turns one email category off, or back on, with the token of an unsubscribe link; no session needed. */
export const useEmailCategoryMutation = () =>
  useMutation<void, ApiError, { query: UnsubscribeNotificationsData['query']; enabled: boolean }>({
    mutationKey: ['me', 'email-category'],
    mutationFn: async ({ query, enabled }) => {
      if (enabled) await resubscribeNotifications({ query });
      else await unsubscribeNotifications({ query });
    },
  });

export const fetchPushVapid = () => getPushVapid();
export const registerPushSubscription = (body: CreatePushSubscriptionData['body']) => createPushSubscription({ body });
export const removePushSubscription = (endpoint: string) => deletePushSubscription({ query: { endpoint } });
