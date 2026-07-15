import { useEffect, useRef, useState } from 'react';

/**
 * Clipboard copy hook: exposes `copied`/`error` and `copyToClipboard(text)`.
 * `copied` resets after `timeoutDuration` ms (default 3000).
 */
export const useCopyToClipboard = (timeoutDuration = 3000) => {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setError(null);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), timeoutDuration);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to copy text'));
    }
  };

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  return { copied, error, copyToClipboard };
};
