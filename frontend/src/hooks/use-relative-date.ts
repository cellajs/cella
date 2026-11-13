import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type DateMiniOptions, dateMini, dateMiniKind, dayMs, hourMs, minuteMs, msFromNow } from '~/utils/date-mini';

const getDelay = (date: string, compact?: boolean) => {
  const age = -msFromNow(date);
  if (age < minuteMs) return 10_000;
  if (age < hourMs) return 30_000;
  // A date past a day stays put, a compact count goes on: "1d" turns "2d"
  if (age < dayMs || compact) return hourMs;
  return 0;
};

const describe = (date: string, options: DateMiniOptions) => ({ text: dateMini(date, options), kind: dateMiniKind(date, options) });

/**
 * `useRelativeDate` with what the text is ("now", a count or a date), for a sentence that reads each its own way.
 * @public
 */
export const useRelativeTime = (date: string, { ago, compact }: DateMiniOptions = {}) => {
  const { i18n } = useTranslation();
  const language = i18n.language;
  const [time, setTime] = useState(() => describe(date, { ago, compact }));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const next = describe(date, { ago, compact });
      setTime((current) => (current.text === next.text && current.kind === next.kind ? current : next));
      const delay = getDelay(date, compact);
      if (delay) timer = setTimeout(tick, delay);
    };

    tick();

    return () => clearTimeout(timer);
  }, [date, ago, compact, language]);

  return time;
};

/** Relative date string that refreshes at 10s, 30s or 1h intervals, stops after a day unless compact, and follows the active language. */
export const useRelativeDate = (date: string, options?: DateMiniOptions) => useRelativeTime(date, options).text;
