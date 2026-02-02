import { useCallback, useEffect, useRef } from 'react';
import { useLatestRef } from './use-latest-ref';

interface UseAutoSaveOptions<T> {
  /** Current data to potentially save */
  data: T;
  /** Function to check if data has changed and needs saving */
  hasChanges: (data: T) => boolean;
  /** Function to save the data */
  onSave: (data: T) => void | Promise<void>;
  /** Delay after last change before auto-save triggers (default: 5000ms) */
  inactivityDelay?: number;
  /** Maximum time before forcing a save regardless of activity (default: 30000ms) */
  maxDelay?: number;
  /** Whether auto-save is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Auto-save hook that triggers saves based on inactivity or max time elapsed.
 *
 * Saves occur when:
 * - User stops making changes for `inactivityDelay` milliseconds
 * - OR `maxDelay` milliseconds have passed since the first unsaved change
 * - OR the component unmounts with unsaved changes (route change)
 */
export function useAutoSave<T>({
  data,
  hasChanges,
  onSave,
  inactivityDelay = 5000,
  maxDelay = 30000,
  enabled = true,
}: UseAutoSaveOptions<T>) {
  // Use latest refs to avoid stale closures in timers and cleanup
  const dataRef = useLatestRef(data);
  const hasChangesRef = useLatestRef(hasChanges);
  const onSaveRef = useLatestRef(onSave);

  // Timer refs
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstChangeTimeRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (maxDelayTimerRef.current) {
      clearTimeout(maxDelayTimerRef.current);
      maxDelayTimerRef.current = null;
    }
    firstChangeTimeRef.current = null;
  }, []);

  // Save function - uses refs so no stale closure issues
  const save = useCallback(async () => {
    if (isSavingRef.current) return;

    const currentData = dataRef.current;
    if (!hasChangesRef.current(currentData)) {
      clearTimers();
      return;
    }

    isSavingRef.current = true;
    try {
      await onSaveRef.current(currentData);
      clearTimers();
    } finally {
      isSavingRef.current = false;
    }
  }, [clearTimers]);

  // Manage auto-save timing
  useEffect(() => {
    if (!enabled || !hasChanges(data)) {
      clearTimers();
      return;
    }

    // Reset inactivity timer on each change
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = setTimeout(save, inactivityDelay);

    // Set max delay timer only on first unsaved change
    if (!firstChangeTimeRef.current) {
      firstChangeTimeRef.current = Date.now();
      maxDelayTimerRef.current = setTimeout(save, maxDelay);
    }

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [data, enabled, hasChanges, inactivityDelay, maxDelay, save, clearTimers]);

  // Save on unmount if there are pending changes (handles route changes)
  useEffect(() => {
    return () => {
      clearTimers();
      if (hasChangesRef.current(dataRef.current) && !isSavingRef.current) {
        onSaveRef.current(dataRef.current);
      }
    };
  }, [clearTimers]);

  return {
    /** Manually trigger a save */
    saveNow: save,
    /** Whether there are unsaved changes */
    hasUnsavedChanges: hasChanges(data),
  };
}
