import dayjs from 'dayjs';
import i18n from 'i18next';

const monthAndDay = { month: 'short', day: 'numeric' } as const;

/**
 * A past or future date in the active language, or null for a nullish date.
 * 'day' reads "Today", "Yesterday", "Tomorrow", "Sep 23", or "Sep 23, 2024" outside this year.
 * 'minute' reads "Today, 20:29", "Monday, 20:29" within a week, "Sep 23, 20:29" within ~3 months, else "Sep 23, 2024".
 */
export const dateShort = (date?: string | null | Date, precision: 'day' | 'minute' = 'minute') => {
  if (!date) return null;
  const local = dayjs.utc(date).local();
  const now = dayjs();
  const { language } = i18n;
  const days = local.startOf('day').diff(now.startOf('day'), 'day');
  const showsTime = precision === 'minute';
  const format = (options: Intl.DateTimeFormatOptions) => local.toDate().toLocaleDateString(language, options);

  let day: string;
  if (Math.abs(days) <= 1) day = new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(days, 'day');
  else if (showsTime && Math.abs(days) < 7) day = format({ weekday: 'long' });
  else if (showsTime ? Math.abs(now.diff(local, 'month')) <= 3 : local.year() === now.year()) day = format(monthAndDay);
  else return format({ ...monthAndDay, year: 'numeric' });

  const capitalized = day.charAt(0).toUpperCase() + day.slice(1);
  return showsTime ? `${capitalized}, ${local.format('H:mm')}` : capitalized;
};
