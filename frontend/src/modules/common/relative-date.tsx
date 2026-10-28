import { useRelativeDate } from '~/hooks/use-relative-date';

/** How long ago `date` was, such as "2h ago", kept current while it is recent. */
export function RelativeDate({ date }: { date: string }) {
  return useRelativeDate(date, true);
}
