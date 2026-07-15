import { useEffect, useRef, useState } from 'react';

/**
 * Copies text to the clipboard, exposing `copied`/`error` state and a `copyToClipboard(text)` action.
 * `copied` flips true on success and resets after `timeoutDuration` ms.
 * @param timeoutDuration - Reset delay in ms (default 3000).
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
