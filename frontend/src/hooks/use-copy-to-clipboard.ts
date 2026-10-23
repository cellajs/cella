import { useEffect, useRef, useState } from 'react';

/** Clipboard copy hook; `copied` resets after `timeoutMs` (default 3000), and `copyToClipboard` resolves to whether it worked. */
export const useCopyToClipboard = (timeoutMs = 3000) => {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), timeoutMs);
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
