import { useCallback, useEffect, useRef } from 'react';

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
 *
 * @example
 * useAutoSave({
 *   data: formValues,
 *   hasChanges: (data) => data.name !== originalName,
 *   onSave: (data) => collection.update(id, data),
 *   inactivityDelay: 5000,
 *   maxDelay: 30000,
 * });
 */
export function useAutoSave<T>({
  data,
  hasChanges,
  onSave,
  inactivityDelay = 5000,
  maxDelay = 30000,
  enabled = true,
}: UseAutoSaveOptions<T>) {
  // Refs to track timers and state without triggering re-renders
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstChangeTimeRef = useRef<number | null>(null);
  const lastSavedDataRef = useRef<T>(data);
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

  // Save function that clears timers and updates last saved data
  const save = useCallback(async () => {
    if (isSavingRef.current) return;

    const currentData = data;
    if (!hasChanges(currentData)) {
      clearTimers();
      return;
    }

    isSavingRef.current = true;
    try {
      await onSave(currentData);
      lastSavedDataRef.current = currentData;
      clearTimers();
    } finally {
      isSavingRef.current = false;
    }
  }, [data, hasChanges, onSave, clearTimers]);

  // Effect that manages auto-save timing
  useEffect(() => {
    if (!enabled || !hasChanges(data)) {
      clearTimers();
      return;
    }

    // Clear existing inactivity timer (new change came in)
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    // Set inactivity timer
    inactivityTimerRef.current = setTimeout(() => {
      save();
    }, inactivityDelay);

    // Set max delay timer only if this is the first unsaved change
    if (!firstChangeTimeRef.current) {
      firstChangeTimeRef.current = Date.now();
      maxDelayTimerRef.current = setTimeout(() => {
        save();
      }, maxDelay);
    }

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [data, enabled, hasChanges, inactivityDelay, maxDelay, save, clearTimers]);

  // Cleanup on unmount - save if there are pending changes
  useEffect(() => {
    return () => {
      clearTimers();
      // Save on unmount if there are unsaved changes
      if (hasChanges(data) && !isSavingRef.current) {
        onSave(data);
      }
    };
  }, []);

  // Expose manual save and status
  return {
    /** Manually trigger a save */
    saveNow: save,
    /** Whether there are unsaved changes */
    hasUnsavedChanges: hasChanges(data),
  };
}
