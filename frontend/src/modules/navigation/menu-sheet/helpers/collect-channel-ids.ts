import type { UserMenuItem } from '~/modules/me/types';

/** Non-muted item ids plus their non-muted, non-archived sub-item ids; items can host content directly and in sub-channels. */
export function collectChannelIds(items: UserMenuItem[], opts?: { archived?: boolean }): string[] {
  const ids: string[] = [];
  for (const item of items) {
    if (opts?.archived !== undefined && !!item.membership.archived !== opts.archived) continue;
    if (!item.membership.muted) ids.push(item.id);
    for (const sub of item.submenu ?? []) {
      if (!sub.membership.muted && !sub.membership.archived) ids.push(sub.id);
    }
  }
  return ids;
}
