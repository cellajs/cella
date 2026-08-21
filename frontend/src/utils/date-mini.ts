import dayjs from 'dayjs';
import { t } from 'i18next';

const second = 1e3;
const minute = 6e4;
const hour = 36e5;
const day = 864e5;
const year = 31536e6;

/**
 * Distance from now as a minimal relative string: "now" (<1s), seconds (<1m), minutes (<1h), hours (<1d),
 * "MMM D" (<1y), else "MMM D, YYYY". Unit strings come from the `c:time_mini.*` keys. `addStr` is appended.
 */
export const dateMini = (startDate: string, addStr?: string) => {
  const start = dayjs.utc(startDate).local();
  const diff = Math.abs(dayjs().diff(start));

  let result: string;

  if (diff <= second) return t('c:time_mini.now');
  if (diff < minute) result = t('c:time_mini.seconds', { count: Math.floor(diff / second) });
  else if (diff < hour) result = t('c:time_mini.minutes', { count: Math.floor(diff / minute) });
  else if (diff < day) result = t('c:time_mini.hours', { count: Math.floor(diff / hour) });
  else if (diff < year) return start.format('MMM D');
  else return start.format('MMM D, YYYY');

  return addStr ? `${result} ${addStr}` : result;
};
