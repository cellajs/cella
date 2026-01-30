import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef } from 'react';
import type { DialogData } from '~/modules/common/dialoger/use-dialoger';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import type { SheetData } from '~/modules/common/sheeter/use-sheeter';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { fallbackContentRef } from '~/utils/fallback-content-ref';

type OverlayType = 'sheet' | 'dialog';

type SheetOptions = Omit<SheetData, 'id' | 'triggerRef' | 'onClose'>;
type DialogOptions = Omit<DialogData, 'id' | 'triggerRef' | 'onClose'>;

type OverlayOptions<T extends OverlayType> = T extends 'sheet' ? SheetOptions : DialogOptions;

interface UseUrlSheetConfig<T extends OverlayType> {
  /** The search param key to watch (e.g., 'userSheetId', 'attachmentDialogId') */
  searchParamKey: string;

  /** Additional search param keys to clear when closing */
  additionalSearchParamKeys?: string[];

  /** 'sheet' uses useSheeter, 'dialog' uses useDialoger */
  type: T;

  /** Instance ID - either static string or function that receives the search param value */
  instanceId: string | ((id: string) => string);

  /** Render the content - receives id and org context */
  renderContent: (id: string, orgIdOrSlug: string | undefined) => ReactNode;

  /** Whether org context is required for the overlay to open */
  requireOrgContext?: boolean;

  /** Async loader before creating (optional). Return cleanup function if needed. */
  onBeforeCreate?: (id: string, orgIdOrSlug: string | undefined) => Promise<{ cleanup?: () => void } | void>;

  /** Sheet/dialog configuration options */
  options: OverlayOptions<T>;
}

/**
 * A hook to manage URL-based sheets/dialogs with proper close handling.
 * Prevents infinite loops by separating URL-driven state from UI-driven closes.
 *
 * Flow:
 * - URL has param → create overlay
 * - URL loses param → cleanup overlay (no navigation needed)
 * - UI close (ESC/click outside) → history.back() if trigger exists, else navigate to clear param
 */
export function useUrlSheet<T extends OverlayType>(config: UseUrlSheetConfig<T>) {
  const {
    searchParamKey,
    additionalSearchParamKeys = [],
    type,
    instanceId,
    renderContent,
    requireOrgContext = false,
    onBeforeCreate,
    options,
  } = config;

  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as Record<string, string | undefined>;
  const { orgIdOrSlug: baseOrgIdOrSlug, idOrSlug } = useParams({ strict: false });

  const orgIdOrSlug = baseOrgIdOrSlug || idOrSlug;
  const searchParamValue = searchParams[searchParamKey];

  // Get the appropriate store based on type
  const store = type === 'sheet' ? useSheeter : useDialoger;
  const { remove, get, getTriggerRef } = store();

  // Track cleanup function from onBeforeCreate
  const cleanupRef = useRef<(() => void) | undefined>(undefined);

  // Track if we're currently closing to prevent re-entry
  const isClosingRef = useRef(false);

  useEffect(() => {
    // Skip if no search param value
    if (!searchParamValue) return;

    // Skip if org context required but missing
    if (requireOrgContext && !orgIdOrSlug) return;

    const resolvedInstanceId = typeof instanceId === 'function' ? instanceId(searchParamValue) : instanceId;

    // Skip if overlay already exists (prevent duplicates)
    if (get(resolvedInstanceId)) return;

    const triggerRef = getTriggerRef(searchParamValue) || fallbackContentRef;
    const hasTrigger = !!getTriggerRef(searchParamValue);

    /**
     * Handle close from UI (ESC, click outside, close button).
     * This is NOT called when URL changes externally (back button, navigation).
     */
    const handleClose = (isCleanup?: boolean) => {
      // Run any cleanup from onBeforeCreate
      cleanupRef.current?.();
      cleanupRef.current = undefined;

      // If this is a cleanup call (from useEffect cleanup), don't navigate
      if (isCleanup) return;

      // Prevent re-entry during close
      if (isClosingRef.current) return;
      isClosingRef.current = true;

      // If opened via trigger (pushed to history), use history.back()
      if (hasTrigger) {
        history.back();
        isClosingRef.current = false;
        return;
      }

      // Otherwise navigate to clear the search param (direct URL access case)
      const paramsToRemove = [searchParamKey, ...additionalSearchParamKeys];
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
      isClosingRef.current = false;
    };

    const createOverlay = async () => {
      // Run async loader if provided
      if (onBeforeCreate) {
        const result = await onBeforeCreate(searchParamValue, orgIdOrSlug);
        if (result?.cleanup) {
          cleanupRef.current = result.cleanup;
        }
      }

      // Create the overlay with deferred timing to ensure DOM is ready
      setTimeout(() => {
        const content = renderContent(searchParamValue, orgIdOrSlug);

        // Use type-specific create to satisfy TypeScript
        if (type === 'sheet') {
          useSheeter.getState().create(content, {
            id: resolvedInstanceId,
            triggerRef,
            onClose: handleClose,
            ...options,
          } as SheetData);
        } else {
          useDialoger.getState().create(content, {
            id: resolvedInstanceId,
            triggerRef,
            onClose: handleClose,
            ...options,
          } as DialogData);
        }
      }, 0);
    };

    createOverlay();

    // Cleanup when search param disappears (URL changed externally)
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = undefined;
      remove(resolvedInstanceId, { isCleanup: true });
    };
  }, [searchParamValue, orgIdOrSlug]);
}
