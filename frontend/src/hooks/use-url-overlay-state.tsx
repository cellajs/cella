import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useRef } from 'react';
import { type TriggerRef, useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { fallbackContentRef } from '~/utils/fallback-content-ref';

type OverlayType = 'sheet' | 'dialog';

interface UseUrlOverlayStateOptions {
  /** Additional search param keys to clear when closing */
  additionalParamKeys?: string[];
}

interface UrlOverlayState {
  /** Whether the overlay should be open (param exists) */
  isOpen: boolean;
  /** The param value (stable - captured when opened, won't change on navigation) */
  value: string | null;
  /** Organization context from route params */
  orgIdOrSlug: string | undefined;
  /** Trigger ref for focus restoration */
  triggerRef: TriggerRef;
  /** Whether a trigger exists (determines close behavior) */
  hasTrigger: boolean;
  /** Close handler - uses history.back() if trigger exists, else navigate */
  close: (isCleanup?: boolean) => void;
}

/**
 * Low-level hook for URL-based overlay state management.
 * Returns state and close handler - caller controls overlay creation.
 *
 * @param searchParamKey - The search param to watch (e.g., 'userSheetId')
 * @param type - 'sheet' or 'dialog' (determines which store to use for trigger lookup)
 * @param options - Additional options like extra params to clear on close
 */
export function useUrlOverlayState(
  searchParamKey: string,
  type: OverlayType,
  options: UseUrlOverlayStateOptions = {},
): UrlOverlayState {
  const { additionalParamKeys = [] } = options;

  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as Record<string, string | undefined>;
  const { orgIdOrSlug: baseOrgIdOrSlug, idOrSlug } = useParams({ strict: false });

  const orgIdOrSlug = baseOrgIdOrSlug || idOrSlug;
  const searchParamValue = searchParams[searchParamKey];
  const isOpen = !!searchParamValue;

  // Get the appropriate store for trigger lookup
  const sheeterStore = useSheeter();
  const dialogerStore = useDialoger();
  const store = type === 'sheet' ? sheeterStore : dialogerStore;

  // Capture initial value when opening (stable across value changes)
  const initialValueRef = useRef<string | null>(null);
  const isClosingRef = useRef(false);

  useEffect(() => {
    if (isOpen && initialValueRef.current === null) {
      initialValueRef.current = searchParamValue ?? null;
    } else if (!isOpen) {
      initialValueRef.current = null;
    }
  }, [isOpen, searchParamValue]);

  const value = initialValueRef.current;
  const triggerRef = value ? store.getTriggerRef(value) || fallbackContentRef : fallbackContentRef;
  const hasTrigger = !!(value && store.getTriggerRef(value));

  const close = useCallback(
    (isCleanup?: boolean) => {
      if (isCleanup) return;
      if (isClosingRef.current) return;
      isClosingRef.current = true;

      if (hasTrigger) {
        history.back();
      } else {
        const paramsToRemove = [searchParamKey, ...additionalParamKeys];
        navigate({
          to: '.',
          replace: true,
          resetScroll: false,
          search: (prev) => {
            const next = { ...prev };
            for (const key of paramsToRemove) {
              (next as Record<string, unknown>)[key] = undefined;
            }
            return next;
          },
        });
      }
      isClosingRef.current = false;
    },
    [hasTrigger, searchParamKey, additionalParamKeys, navigate],
  );

  return { isOpen, value, orgIdOrSlug, triggerRef, hasTrigger, close };
}
