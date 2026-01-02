import { useEffect, useRef, useState } from 'react';
import type { AttachmentOfflineExecutor } from '~/modules/attachments/offline';

/**
 * Registry of active offline executors by entity ID.
 * This allows multiple collections (e.g., per organization) to have their own executors.
 */
const executorRegistry = new Map<string, AttachmentOfflineExecutor>();

/**
 * Register an offline executor for cleanup on offline mode disable.
 */
export const registerExecutor = (key: string, executor: AttachmentOfflineExecutor) => {
  executorRegistry.set(key, executor);
};

/**
 * Unregister and dispose an executor.
 */
export const unregisterExecutor = (key: string) => {
  const executor = executorRegistry.get(key);
  if (executor) {
    executor.dispose();
    executorRegistry.delete(key);
  }
};

/**
 * Dispose all registered executors (used when offline mode is disabled).
 */
export const disposeAllExecutors = () => {
  for (const [key, executor] of executorRegistry) {
    executor.dispose();
    executorRegistry.delete(key);
  }
};

/**
 * Notify all executors that we're back online.
 */
export const notifyOnline = () => {
  for (const executor of executorRegistry.values()) {
    executor.notifyOnline();
  }
};

/**
 * Get count of pending transactions across all executors.
 */
export const getPendingCount = async (): Promise<number> => {
  let total = 0;
  for (const executor of executorRegistry.values()) {
    const pending = await executor.peekOutbox();
    total += pending.length;
  }
  return total;
};

/**
 * Hook to manage network status and offline executor coordination.
 *
 * Features:
 * - Tracks online/offline status
 * - Notifies executors when coming back online
 * - Provides pending transaction count for UI indicators
 */
export const useOfflineManager = (enabled: boolean) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;

    // Handle online/offline events
    const handleOnline = () => {
      setIsOnline(true);
      notifyOnline();
      console.info('[Offline Manager] Network is online, notifying executors');
    };

    const handleOffline = () => {
      setIsOnline(false);
      console.info('[Offline Manager] Network is offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Poll for pending count periodically
    const updatePendingCount = async () => {
      const count = await getPendingCount();
      setPendingCount(count);
    };

    // Initial check
    updatePendingCount();

    // Poll every 5 seconds when enabled
    pollIntervalRef.current = setInterval(updatePendingCount, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [enabled]);

  // Cleanup all executors when offline mode is disabled
  useEffect(() => {
    if (!enabled) {
      disposeAllExecutors();
    }
  }, [enabled]);

  return {
    isOnline,
    pendingCount,
    hasPending: pendingCount > 0,
  };
};
