import { CircleIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '~/store/ui';

const refreshTimeout = 5000;

/**
 * Find the nearest scrollable ancestor of a given element.
 * Returns the element whose scrollTop > 0 would indicate the user has scrolled down.
 */
function getScrollParent(el: Element | null): Element | null {
  let current = el;
  while (current && current !== document.documentElement) {
    const style = getComputedStyle(current);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

type Props = {
  onRefresh: () => void | Promise<void>;
  /** Whether queries are currently fetching (from useIsFetching) */
  isFetching?: boolean;
  refreshThreshold?: number;
  maximumPullLength?: number;
  isDisabled?: boolean;
};

export function PullToRefresh({
  onRefresh,
  isFetching = false,
  refreshThreshold = 90,
  maximumPullLength = 200,
  isDisabled = false,
}: Props) {
  const [pullPosition, setPullPosition] = useState(0);
  // Tracks whether refresh was triggered by pull gesture (to scope spinner to pull-to-refresh only)
  const [wasTriggered, setWasTriggered] = useState(false);

  const pullStartRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRefreshing = wasTriggered && isFetching;

  const isPulling = pullPosition > 0;

  // Disable when UI is locked (dialog, dropdown, sheet open)
  const isUILocked = useUIStore((state) => state.uiLocks.length > 0);
  if (isUILocked) isDisabled = true;

  const startPull = useCallback(
    (e: TouchEvent) => {
      if (isDisabled) return;

      // Check if user is at the top: look at the nearest scrollable ancestor
      // of the touch target, or fall back to window.scrollY
      const target = e.target as Element | null;
      const scrollParent = getScrollParent(target);
      const scrollTop = scrollParent ? scrollParent.scrollTop : window.scrollY;
      if (scrollTop > 0) return;

      const touch = e.targetTouches[0];
      const pullArea = window.innerHeight * 0.4;

      if (touch.clientY <= pullArea) {
        pullStartRef.current = touch.screenY;
        isDraggingRef.current = true;
      }
    },
    [isDisabled],
  );

  // Minimum swipe distance before the pull-to-refresh UI appears and starts counting
  const activationThreshold = 30;

  const onPull = useCallback(
    (e: TouchEvent) => {
      if (isDisabled || !isDraggingRef.current || pullStartRef.current === null) return;

      const touch = e.targetTouches[0];
      if (!touch) return;

      const rawDelta = touch.screenY - pullStartRef.current;

      // Require a minimum swipe distance before activating
      if (rawDelta < activationThreshold) {
        setPullPosition(0);
        return;
      }

      const delta = rawDelta - activationThreshold;
      const clamped = Math.max(0, Math.min(delta, maximumPullLength));

      setPullPosition(clamped);
    },
    [isDisabled, maximumPullLength],
  );

  const endPull = useCallback(() => {
    if (isDisabled || !isDraggingRef.current) return;

    // Account for the empty circle phase (30px) before progress counting starts
    const pulledEnough = pullPosition - 30 >= refreshThreshold;

    pullStartRef.current = null;
    isDraggingRef.current = false;

    if (!pulledEnough) {
      // Not enough pull — animate back to 0
      setPullPosition(0);
      return;
    }

    // Trigger refresh — keep pullPosition until isRefreshing takes over
    setWasTriggered(true);
    onRefresh();

    // Safety timeout: clear triggered flag after 5s in case isFetching never settles
    timeoutRef.current = setTimeout(() => setWasTriggered(false), refreshTimeout);
  }, [isDisabled, pullPosition, refreshThreshold, onRefresh]);

  // Once isRefreshing is active, clear pullPosition so the indicator transitions to the refreshing position
  useEffect(() => {
    if (isRefreshing && pullPosition > 0) {
      setPullPosition(0);
    }
  }, [isRefreshing, pullPosition]);

  // Clear triggered flag once fetching completes after a pull-to-refresh
  useEffect(() => {
    if (wasTriggered && !isFetching) {
      // Small delay to avoid flicker if fetching briefly dips to 0 between invalidations
      const id = setTimeout(() => setWasTriggered(false), 100);
      return () => clearTimeout(id);
    }
  }, [wasTriggered, isFetching]);

  // Cleanup safety timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || isDisabled) return;

    const options = { passive: false }; // important!

    window.addEventListener('touchstart', startPull, options);
    window.addEventListener('touchmove', onPull, options);
    window.addEventListener('touchend', endPull, options);

    return () => {
      window.removeEventListener('touchstart', startPull);
      window.removeEventListener('touchmove', onPull);
      window.removeEventListener('touchend', endPull);
    };
  }, [startPull, onPull, endPull, isDisabled]);

  useEffect(() => {
    const className = 'overflow-hidden';

    isPulling ? document.body.classList.add(className) : document.body.classList.remove(className);

    return () => {
      document.body.classList.remove(className);
    };
  }, [isPulling]);

  const radius = 16;
  const stroke = 3;
  const circumference = 2 * Math.PI * radius;

  // First 30px of pull just shows the empty circle, progress starts after that
  const emptyPhase = 30;
  const progressPull = Math.max(0, pullPosition - emptyPhase);
  const clamped = Math.min(progressPull, refreshThreshold);
  const progress = clamped / refreshThreshold;
  const strokeDashoffset = circumference * (1 - progress);

  if (!isPulling && !isRefreshing) return null;

  return (
    <>
      <div
        style={{
          top: isRefreshing ? 48 : Math.min(pullPosition / 1.5, 120),
          opacity: isRefreshing || pullPosition > 0 ? 1 : 0,
          transition: isDraggingRef.current ? 'none' : 'top 0.3s ease-out, opacity 0.3s ease-out',
        }}
        className="bg-base-100 fixed inset-x-1/2 z-300 h-8 w-8 -translate-x-1/2"
      >
        <CircleIcon className="absolute size-8 text-muted-foreground/50" strokeWidth={4} />
        <svg
          className={`h-8 w-8 ${isRefreshing ? 'animate-spin' : ''}`}
          viewBox="0 0 40 40"
          style={{
            transform: isRefreshing ? undefined : `rotate(${pullPosition * 2}deg)`,
            transition: isRefreshing ? 'none' : 'transform 0.1s ease-out',
          }}
        >
          <title>Pull to refresh</title>
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={isRefreshing ? 0 : strokeDashoffset}
            strokeLinecap="round"
            className="text-foreground"
          />
        </svg>
      </div>
    </>
  );
}
