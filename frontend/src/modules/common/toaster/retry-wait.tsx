import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface RetryWaitProps {
  /** Timestamp (ms) at which the restriction ends. */
  until: number;
}

/**
 * The wait of a rate-limited request as toast text: "try again in N minutes", counting down for as long as the toast
 * stays open and saying so once the wait is over.
 */
export function RetryWait({ until }: RetryWaitProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now);
  const over = now >= until;

  useEffect(() => {
    if (over) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [over]);

  return over ? t('c:retry_now') : t('c:retry_in_minutes', { count: Math.ceil((until - now) / 60_000) });
}
