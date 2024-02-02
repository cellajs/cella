import { useCallback, useState } from 'react';

// Custom hook to copy text to clipboard
export const useCopyToClipboard = (timeoutDuration = 1000) => {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const copyToClipboard = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setError(null);
        setTimeout(() => setCopied(false), timeoutDuration);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to copy text'));
      }
    },
    [timeoutDuration],
  );

  return { copied, error, copyToClipboard };
};
