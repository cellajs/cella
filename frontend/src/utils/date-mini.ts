import i18n, { t } from 'i18next';

const secondMs = 1e3;
export const minuteMs = 6e4;
export const hourMs = 36e5;
export const dayMs = 864e5;
const weekMs = 7 * dayMs;
const yearMs = 31536e6;
const monthMs = yearMs / 12;

export interface DateMiniOptions {
  /** Reads a counted value as `c:time_ago`, such as "3h ago". */
  ago?: boolean;
  /** Counts past a day too, as "2d", "3w", "4mo" and "2y", where a date would not fit. */
  compact?: boolean;
}

/** What `dateMini` shows: "now", a counted distance, or a date. */
type DateMiniKind = 'now' | 'count' | 'date';

/** Milliseconds from now to `date`, negative for a past date. */
export const msFromNow = (date: string | number) => new Date(date).getTime() - Date.now();

export const dateMiniKind = (startDate: string, { compact }: DateMiniOptions = {}): DateMiniKind => {
  const diff = Math.abs(msFromNow(startDate));
  if (diff <= secondMs) return 'now';
  return diff < dayMs || compact ? 'count' : 'date';
};

/**
 * Distance from now as a minimal relative string: "now" (<1s), seconds (<1m), minutes (<1h), hours (<1d),
 * a month and day (<1y), else with the year. `compact` counts on in days, weeks, months and years. Unit strings come
 * from the `c:time_mini.*` keys.
 */
export const dateMini = (startDate: string, { ago, compact }: DateMiniOptions = {}) => {
  const diff = Math.abs(msFromNow(startDate));

  let result: string;

  if (diff <= secondMs) return t('c:time_mini.now');
  if (diff < minuteMs) result = t('c:time_mini.seconds', { count: Math.floor(diff / secondMs) });
  else if (diff < hourMs) result = t('c:time_mini.minutes', { count: Math.floor(diff / minuteMs) });
  else if (diff < dayMs) result = t('c:time_mini.hours', { count: Math.floor(diff / hourMs) });
  else if (!compact) {
    const year = diff < yearMs ? undefined : 'numeric';
    return new Date(startDate).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric', year });
  } else if (diff < weekMs) result = t('c:time_mini.days', { count: Math.floor(diff / dayMs) });
  // 28 and 29 days still read 4w: 1mo starts where a month has passed
  else if (diff < monthMs) result = t('c:time_mini.weeks', { count: Math.floor(diff / weekMs) });
  else if (diff < yearMs) result = t('c:time_mini.months', { count: Math.floor(diff / monthMs) });
  else result = t('c:time_mini.years', { count: Math.floor(diff / yearMs) });

  return ago ? t('c:time_ago', { time: result }) : result;
};

const relativeUnits = [
  ['year', yearMs],
  ['month', monthMs],
  ['week', weekMs],
  ['day', dayMs],
  ['hour', hourMs],
  ['minute', minuteMs],
  ['second', secondMs],
] as const;

/** Distance from now in words of the active language, for inside a sentence: "3 hours ago", "in 2 days", "yesterday". */
export const dateRelative = (date: string | number) => {
  const diff = msFromNow(date);
  const [unit, unitMs] = relativeUnits.find(([, ms]) => Math.abs(diff) >= ms) ?? relativeUnits[relativeUnits.length - 1];
  return new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' }).format(Math.round(diff / unitMs), unit);
};
