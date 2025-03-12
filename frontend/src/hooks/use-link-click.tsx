import { onlineManager } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

/**
 * Custom hook to handle clicks on TanStack Link component.
 * Ensures proper handling of online/offline states and prevents default navigation when necessary.
 */
export const useLinkClick = () => {
  const navigate = useNavigate();

  return (
    e: React.MouseEvent<HTMLAnchorElement>,
    newSearch: Record<string, string | undefined>,
    onOffline: 'nothing' | 'proceed' | 'updateSearch' = 'nothing',
  ) => {
    const isOnline = onlineManager.isOnline();

    // Handle offline behaviors
    if (!isOnline) {
      if (onOffline === 'nothing') return e.preventDefault();
      if (onOffline === 'proceed') return;
    }

    // Open in new tab if Ctrl or Meta key is pressed
    if (e.metaKey || e.ctrlKey) return;

    e.preventDefault();

    navigate({
      to: '.',
      replace: true,
      resetScroll: false,
      search: (prev) => ({ ...prev, ...newSearch }),
    });
  };
};
