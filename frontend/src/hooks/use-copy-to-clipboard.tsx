import { useCallback, useState } from 'react';

/**
 * Custom hook to copy text to the clipboard and handle success/error states.
 * After a successful copy, the `copied` state will be set to `true` and reset after a specified timeout duration.
 *
 * @param timeoutDuration - Optional timeout in milliseconds after which the `copied` state will be reset.
 *   Default is `3000` milliseconds (3 seconds).
 *
 * @returns An object containing:
 *   - `copied`: A boolean indicating whether the text has been successfully copied to the clipboard.
 *   - `error`: An error object if the copy operation fails, otherwise `null`.
 *   - `copyToClipboard`: A function to trigger the copy action with the text to be copied as the argument.
 */
export const useCopyToClipboard = (timeoutDuration = 3000) => {
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
