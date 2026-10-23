import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

const getIsOnline = () => onlineManager.isOnline();

/** Network status sourced from TanStack Query's onlineManager. */
export const useOnlineManager = () => useSyncExternalStore(onlineManager.subscribe, getIsOnline);
