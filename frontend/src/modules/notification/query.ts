import { queryOptions, useMutation } from '@tanstack/react-query';
import {
  type CreatePushSubscriptionData,
  createPushSubscription,
  getNotificationPreferences,
  getPushVapid,
  type ListNotificationsResponse,
  listNotifications,
  type MarkNotificationsReadData,
  markNotificationsRead,
  removePushSubscription,
  resubscribeNotifications,
  type UnsubscribeNotificationsData,
  type UpdateNotificationPreferencesData,
  unsubscribeNotifications,
  updateNotificationPreferences,
} from 'sdk';
import type { ApiError } from '~/lib/api';
import { queryClient } from '~/query/query-client';

export const notificationKeys = { list: ['me', 'notifications'] as const, preferences: ['me', 'notification-preferences'] as const };

/** Each fetch replaces the cached list whole; the `notification.*` signals invalidate it, and the stale time and window focus cover a tab that missed one. */
export const notificationsQueryOptions = () =>
  queryOptions({
    queryKey: notificationKeys.list,
    queryFn: () => listNotifications({ query: { limit: 30 } }),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

export const invalidateNotifications = () => queryClient.invalidateQueries({ queryKey: notificationKeys.list });

/** Marks the cached rows read at once and sets the unread count only on mark-all (0), since the server counts rows past the page; the `onSettled` refetch brings its count and rolls back a failure. */
export const useMarkNotificationsReadMutation = () =>
  useMutation({
    mutationFn: (body: MarkNotificationsReadData['body']) => markNotificationsRead({ body }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.list });
      const previous = queryClient.getQueryData(notificationsQueryOptions().queryKey);
      if (!previous) return;

      const readAt = new Date().toISOString();
      const shouldMark = (item: ListNotificationsResponse['items'][number]) => {
        if (body.contextId) return item.contextId === body.contextId;
        if (body.ids?.length) return body.ids.includes(item.id);
        return true;
      };

      const items = previous.items.map((item) => (item.readAt || !shouldMark(item) ? item : { ...item, readAt }));
      queryClient.setQueryData(notificationsQueryOptions().queryKey, {
        ...previous,
        items,
        ...(!body.contextId && !body.ids?.length && { unreadCount: 0 }),
      });
    },
    onSettled: () => invalidateNotifications(),
  });

export const notificationPreferencesQueryOptions = () =>
  queryOptions({ queryKey: notificationKeys.preferences, queryFn: () => getNotificationPreferences() });

/** Partial update: the server merges per key, so an older tab cannot clobber a preference it never knew. */
export const useUpdateNotificationPreferencesMutation = () =>
  useMutation({
    mutationFn: (body: UpdateNotificationPreferencesData['body']) => updateNotificationPreferences({ body }),
    onSuccess: (updated) => queryClient.setQueryData(notificationPreferencesQueryOptions().queryKey, updated),
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
export const unregisterPushSubscription = (endpoint: string) => removePushSubscription({ body: { endpoint } });
