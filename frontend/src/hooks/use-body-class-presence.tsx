import { useEffect, useState } from 'react';

/**
 * Hook to reactively check if specific class names are present on the document body.
 */
export function useBodyClassPresence(classNames: string[]) {
  const [isPresent, setIsPresent] = useState(() => classNames.some((name) => document.body.classList.contains(name)));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const hasClass = classNames.some((name) => document.body.classList.contains(name));
      setIsPresent(hasClass);
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, [classNames.join('|')]);

  return isPresent;
}
