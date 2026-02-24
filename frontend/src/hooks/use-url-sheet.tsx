import { useMatch, useNavigate, useSearch } from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';
import type { SheetData } from '~/modules/common/sheeter/use-sheeter';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { fallbackContentRef } from '~/utils/fallback-content-ref';

type SheetOptions = Omit<SheetData, 'id' | 'triggerRef' | 'onClose'>;

interface OverlayConfig<TOptions> {
  /** The search param key to watch (e.g., 'userSheetId') */
  searchParamKey: string;
  /** Additional search param keys to clear when closing */
  additionalSearchParamKeys?: string[];
  /** Render overlay content. Receives the search param value and org ID from URL context. */
  renderContent: (id: string, orgId: string | undefined) => ReactNode;
  /** Called after close (not during cleanup). Receives the search param value. */
  onAfterClose?: (id: string) => void;
  /** Overlay configuration options */
  options: TOptions;
}

export type UseUrlSheetConfig = OverlayConfig<SheetOptions>;

/** Navigate to clear search params (always replace, no history.back) */
function useCloseOverlay(searchParamKey: string, additionalParamKeys: string[] = []) {
  const navigate = useNavigate();
  const paramsToRemove = [searchParamKey, ...additionalParamKeys];

  return () => {
    navigate({
      to: '.',
      replace: true,
      resetScroll: false,
      search: (prev) => {
        const next: Record<string, unknown> = { ...prev };
        for (const key of paramsToRemove) next[key] = undefined;
        return next;
      },
    });
  };
}

/**
 * Manages a URL-driven sheet overlay.
 * Opens a sheet when the search param is present, closes it when removed.
 */
export function useUrlSheet(config: UseUrlSheetConfig) {
  const { searchParamKey, additionalSearchParamKeys, renderContent, onAfterClose, options } = config;

  const searchParams = useSearch({ strict: false }) as Record<string, string | undefined>;
  const orgMatch = useMatch({ from: '/appLayout/$tenantId/$orgSlug', shouldThrow: false });
  const orgId = orgMatch?.context?.organization?.id;
  const value = searchParams[searchParamKey] ?? null;
  const close = useCloseOverlay(searchParamKey, additionalSearchParamKeys);

  useEffect(() => {
    if (!value) return;

    const id = `${searchParamKey}-${value}`;
    if (useSheeter.getState().get(id)) return;

    const handleClose = (isCleanup?: boolean) => {
      if (!isCleanup) {
        onAfterClose?.(value);
        close();
      }
    };

    queueMicrotask(() => {
      useSheeter
        .getState()
        .create(renderContent(value, orgId), { id, triggerRef: fallbackContentRef, onClose: handleClose, ...options });
    });

    return () => {
      useSheeter.getState().remove(id, { isCleanup: true });
    };
  }, [value, orgId]);
}
