import { useMatch, useNavigate, useSearch } from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';
import { type SheetData, sheeter } from '~/modules/common/sheeter/use-sheeter';
import { fallbackContentRef } from '~/utils/fallback-content-ref';

interface UseUrlSheetConfig {
  /** The search param key to watch (e.g., 'userSheetId') */
  searchParamKey: string;
  /** Render overlay content. Receives the search param value and org ID from URL context. */
  renderContent: (id: string, organizationId: string | undefined) => ReactNode;
  /** Called after close (not during cleanup). Receives the search param value. */
  onAfterClose?: (id: string) => void;
  options: Omit<SheetData, 'id' | 'triggerRef' | 'onClose'>;
}

/** Clears the search param by replacing the current history entry. */
function useCloseOverlay(searchParamKey: string) {
  const navigate = useNavigate();

  return () => {
    navigate({ to: '.', replace: true, resetScroll: false, search: (prev) => ({ ...prev, [searchParamKey]: undefined }) });
  };
}

/** Opens a sheet while the search param `searchParamKey` is present and closes it when the param goes. */
export function useUrlSheet(config: UseUrlSheetConfig) {
  const { searchParamKey, renderContent, onAfterClose, options } = config;

  // Primitive selects, so writes to other search keys don't re-render the host.
  const value = useSearch({ strict: false, select: (search) => (search as Record<string, string | undefined>)[searchParamKey] ?? null });
  const organizationId = useMatch({
    from: '/_app/$tenantId/$organizationSlug',
    shouldThrow: false,
    select: (match) => match.context.organization?.id,
  });
  const close = useCloseOverlay(searchParamKey);

  useEffect(() => {
    if (!value) return;

    const id = `${searchParamKey}-${value}`;
    if (sheeter.getState().get(id)) return;

    const handleClose = (isCleanup?: boolean) => {
      if (!isCleanup) {
        onAfterClose?.(value);
        close();
      }
    };

    queueMicrotask(() => {
      sheeter.getState().create(renderContent(value, organizationId), { id, triggerRef: fallbackContentRef, onClose: handleClose, ...options });
    });

    return () => {
      sheeter.getState().remove(id, { isCleanup: true });
    };
  }, [value, organizationId]);
}
