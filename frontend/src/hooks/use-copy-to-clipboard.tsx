import { useEffect, useRef, useState } from 'react';

/** Clipboard copy hook; `copied` resets after `timeoutDuration` ms (default 3000), and `copyToClipboard` resolves to whether it worked. */
export const useCopyToClipboard = (timeoutDuration = 3000) => {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), timeoutDuration);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  return { copied, copyToClipboard };
};
