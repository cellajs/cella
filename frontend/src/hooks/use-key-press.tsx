import { useCallback, useEffect } from 'react';

/**
 * Hook to listen for a specific key press event.
 *
 * This hook listens for a specific key press and executes a callback function
 * when the target key is pressed.
 *
 * @param targetKey - Key to listen for.
 * @param onKeyPress - Callback function that runs when key is pressed.
 * @param enable - Boolean that enables or disables the listener (default is `true`).
 */
export const useKeyPress = (targetKey: string, onKeyPress: (event: KeyboardEvent) => void, enable = true): void => {
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
