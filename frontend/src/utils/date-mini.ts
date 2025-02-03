import dayjs from 'dayjs';
import locale from '~/../../locales';

const second = 1e3;
const minute = 6e4;
const hour = 36e5;
const day = 864e5;
// const week = 6048e5;
// const month = 2592e6;
const year = 31536e6;

/**
 * Converts a date into a minimal format, based on the difference between the current date and the provided start date.
 *
 * If the difference is less than:
 * - a second, returns "now".
 * - a minute, returns the number of seconds.
 * - an hour, returns the number of minutes.
 * - a day, returns the number of hours.
 * - a year, returns the full date in "MMM D" format.
 *
 * @param startDate - The start date to compare against the current date.
 * @param passedLoc - Key for the locale to use for formatting the output.
 * @param addStr - Optional, additional string to append to the result.
 * @returns A string representing the formatted date difference or the full date.
 */
export const dateMini = (startDate: string, passedLoc: keyof typeof locale, addStr?: string) => {
  const start = dayjs(startDate);
  const end = dayjs();
  const diff = Math.abs(end.diff(start));

  const loc = locale[passedLoc];
  let unit: keyof typeof loc;
  let num: number | string;

  if (diff <= second) {
    unit = 'now';
    num = ''; // No number needed for "now"
  } else if (diff < minute) {
    unit = 'seconds';
    num = Math.floor(diff / second);
  } else if (diff < hour) {
    unit = 'minutes';
    num = Math.floor(diff / minute);
  } else if (diff < day) {
    unit = 'hours';
    num = Math.floor(diff / hour);
  } else if (diff < year) {
    return start.format('MMM D');
  } else {
    return start.format('MMM D, YYYY');
  }

  if (unit === 'now') return loc[unit];
  const result = loc[unit].replace('%d', num.toString());
  return addStr ? `${result} ${addStr}` : result;
};
