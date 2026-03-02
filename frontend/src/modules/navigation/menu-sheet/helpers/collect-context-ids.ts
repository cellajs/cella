import type { UserMenuItem } from '~/modules/me/types';

/**
 * Collect context entity IDs from menu items for unseen count aggregation.
 * Expands sub-menus (e.g., projects under workspaces) and filters out muted items.
 */
export function collectContextIds(items: UserMenuItem[], opts?: { archived?: boolean }): string[] {
  const ids: string[] = [];
  for (const item of items) {
    if (opts?.archived !== undefined && !!item.membership.archived !== opts.archived) continue;
    if (item.submenu?.length) {
      for (const sub of item.submenu) {
        if (!sub.membership.muted && !sub.membership.archived) ids.push(sub.id);
      }
    } else if (!item.membership.muted) {
      ids.push(item.id);
    }
  }
  return ids;
}
