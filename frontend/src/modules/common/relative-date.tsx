import { useRelativeDate } from '~/hooks/use-relative-date';

/** How long ago `date` was, such as "2h ago", kept current while it is recent. `compact` counts on as "2d", "3w" or "2y", with no "ago". */
export function RelativeDate({ date, compact }: { date: string; compact?: boolean }) {
  return useRelativeDate(date, compact ? { compact } : { ago: true });
}
