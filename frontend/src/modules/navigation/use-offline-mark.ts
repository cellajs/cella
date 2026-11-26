import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

// How long a visible tab must stay offline before the mark shows (ms).
const showDelayMs = 2000;
// How long after the tab becomes visible no mark shows: a phone's radio can take that long to wake (ms).
const resumeGraceMs = 10_000;

let isShown = false;
let visibleAt = 0;
let showTimer: ReturnType<typeof setTimeout> | undefined;
let stopWatching: (() => void) | undefined;
const listeners = new Set<() => void>();

function setShown(shown: boolean) {
  if (shown === isShown) return;
  isShown = shown;
  for (const listener of listeners) listener();
}

function update() {
  clearTimeout(showTimer);
  if (onlineManager.isOnline() || document.visibilityState !== 'visible') return setShown(false);
  if (!isShown) showTimer = setTimeout(() => setShown(true), Math.max(showDelayMs, visibleAt + resumeGraceMs - Date.now()));
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') visibleAt = Date.now();
  update();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!stopWatching) {
    const unsubscribeOnline = onlineManager.subscribe(update);
    document.addEventListener('visibilitychange', onVisibilityChange);
    stopWatching = () => {
      unsubscribeOnline();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearTimeout(showTimer);
      isShown = false;
      stopWatching = undefined;
    };
    update();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) stopWatching?.();
  };
}

const getIsShown = () => isShown;

/**
 * Whether the offline mark shows: once a visible tab has been offline for `showDelayMs`, and never within `resumeGraceMs`
 * after the tab became visible. A hidden tab or the app back online hides it at once: no frame after resume shows an
 * outage met while hidden. All callers share one state, which keeps the mark, the menu line and the explainer in step.
 */
export const useOfflineMark = () => useSyncExternalStore(subscribe, getIsShown);
