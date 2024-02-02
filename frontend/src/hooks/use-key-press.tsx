import { useCallback, useEffect } from 'react';

export const useKeypress = (targetKey: string, onKeyPress: (event: KeyboardEvent) => void, enable = true): void => {
  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if (!enable || event.key !== targetKey) return;
      onKeyPress(event);
    },
    [enable, targetKey, onKeyPress],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleKeyPress]);
};
