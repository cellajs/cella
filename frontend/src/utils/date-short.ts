import i18n from 'i18next';
import { dayMs } from '~/utils/date-mini';

const monthAndDay = { month: 'short', day: 'numeric' } as const;

/** The local time on a 24-hour clock: "9:05", "20:29". */
export const clockTime = (date: Date) => `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

/** Days since the epoch on the local calendar, so two dates subtract to whole days whatever the clock change between them. */
const calendarDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / dayMs;

/**
 * A past or future date in the active language, or null for a nullish date.
 * 'day' reads "Today", "Yesterday", "Tomorrow", "Sep 23", or "Sep 23, 2024" outside this year.
 * 'minute' reads "Today, 20:29", "Monday, 20:29" within a week, "Sep 23, 20:29" within ~3 months, else "Sep 23, 2024".
 */
export const dateShort = (date?: string | null | Date, precision: 'day' | 'minute' = 'minute') => {
  if (!date) return null;
  const local = new Date(date);
  const now = new Date();
  const { language } = i18n;
  const days = calendarDay(local) - calendarDay(now);
  const months = (local.getFullYear() - now.getFullYear()) * 12 + local.getMonth() - now.getMonth();
  const showsTime = precision === 'minute';
  const format = (options: Intl.DateTimeFormatOptions) => local.toLocaleDateString(language, options);

  let day: string;
  if (Math.abs(days) <= 1) day = new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(days, 'day');
  else if (showsTime && Math.abs(days) < 7) day = format({ weekday: 'long' });
  else if (showsTime ? Math.abs(months) <= 3 : local.getFullYear() === now.getFullYear()) day = format(monthAndDay);
  else return format({ ...monthAndDay, year: 'numeric' });

  const capitalized = day.charAt(0).toUpperCase() + day.slice(1);
  return showsTime ? `${capitalized}, ${clockTime(local)}` : capitalized;
};
