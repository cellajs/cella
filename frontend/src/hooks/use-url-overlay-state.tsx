import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useCallback, useRef } from 'react';
import type { TriggerRef } from '~/modules/common/dialoger/use-dialoger';
import { fallbackContentRef } from '~/utils/fallback-content-ref';

interface StoreWithTriggerRefs {
  getTriggerRef: (id: string) => TriggerRef | null;
}

interface UseUrlOverlayStateOptions {
  additionalParamKeys?: string[];
  getStore: () => StoreWithTriggerRefs;
}

interface UrlOverlayState {
  isOpen: boolean;
  value: string | null;
  orgIdOrSlug: string | undefined;
  triggerRef: TriggerRef;
  hasTrigger: boolean;
  close: (isCleanup?: boolean) => void;
}

/**
 * Low-level hook for URL-based overlay state management.
 * Returns state and close handler - caller controls overlay creation.
 *
 * @param searchParamKey - The search param to watch (e.g., 'userSheetId')
 * @param options - Options including getStore for trigger ref lookup
 */
export function useUrlOverlayState(searchParamKey: string, options: UseUrlOverlayStateOptions): UrlOverlayState {
  const { additionalParamKeys = [], getStore } = options;

  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as Record<string, string | undefined>;
  const { orgIdOrSlug: baseOrgIdOrSlug, idOrSlug } = useParams({ strict: false });

  const orgIdOrSlug = baseOrgIdOrSlug || idOrSlug;
  const value = searchParams[searchParamKey] ?? null;
  const isOpen = !!value;

  // Get trigger ref at render time (stable for initial open)
  const triggerRef = value ? getStore().getTriggerRef(value) || fallbackContentRef : fallbackContentRef;
  const hasTrigger = !!(value && getStore().getTriggerRef(value));

  // Use refs to keep close stable while having access to current values
  const stateRef = useRef({ value, hasTrigger, isClosing: false });
  stateRef.current = { ...stateRef.current, value, hasTrigger };

  const close = useCallback(
    (isCleanup?: boolean) => {
      if (isCleanup) return;
      if (stateRef.current.isClosing) return;
      stateRef.current.isClosing = true;

      // Check hasTrigger at call time to get current state
      const currentValue = stateRef.current.value;
      const currentHasTrigger = !!(currentValue && getStore().getTriggerRef(currentValue));

      if (currentHasTrigger) {
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
      stateRef.current.isClosing = false;
    },
    [getStore, searchParamKey, additionalParamKeys, navigate],
  );

  return { isOpen, value, orgIdOrSlug, triggerRef, hasTrigger, close };
}
