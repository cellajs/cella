import { useEffect, useState } from 'react';
import type locale from '~/../../locales';
import { dateMini } from '~/utils/date-mini';

const minute = 6e4;
const hour = 36e5;
const day = 864e5;

const getDelay = (date: string) => {
  const age = Date.now() - new Date(date).getTime();
  if (age < minute) return 10_000;
  if (age < hour) return 30_000;
  if (age < day) return hour;
  return 0;
};

/** Hook to get a relative date string that updates over time. 10s, 30s, 1h intervals. It stops updating after 1 day. */
export const useRelativeDate = (date: string, loc: keyof typeof locale, addStr?: string) => {
  const [text, setText] = useState(() => dateMini(date, loc, addStr));

  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;

    const tick = () => {
      setText(dateMini(date, loc, addStr));
      const ms = getDelay(date);
      if (ms) id = setTimeout(tick, ms);
    };

    // Schedule the first update
    const ms = getDelay(date);
    if (ms) id = setTimeout(tick, ms);

    return () => clearTimeout(id);
  }, [date, loc, addStr]);

  return text;
};
