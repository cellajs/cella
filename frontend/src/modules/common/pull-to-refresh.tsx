import { useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '~/modules/ui/ui-store';

// Hold the indicator still briefly, then glide it off-screen (ms).
const exitHold = 100;
const exitDuration = 450;

type Phase = 'idle' | 'refreshing' | 'exiting';

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
  const [phase, setPhase] = useState<Phase>('idle');

  const pullStartRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  // Whether any query actually fetched during the current refresh cycle.
  const sawFetchRef = useRef(false);

  const isRefreshing = phase === 'refreshing';
  // Indicator stays styled as a spinner through both refreshing and exiting.
  const isActive = phase !== 'idle';
  const isPulling = pullPosition > 0;

  // Disable when UI is locked (dialog, dropdown, sheet open)
  const isUILocked = useUIStore((state) => state.uiLocks.length > 0);
  if (isUILocked) isDisabled = true;

  const startPull = useCallback(
    (e: TouchEvent) => {
      if (isDisabled) return;

      // Only start at the top of the touch target's scroll parent, or of the window
      const target = e.target as Element | null;
      const scrollParent = getScrollParent(target);
      const scrollTop = scrollParent ? scrollParent.scrollTop : window.scrollY;
      if (scrollTop > 0) return;

      const touch = e.targetTouches[0];
      const pullArea = window.innerHeight * 0.4;

      if (touch.clientY <= pullArea) {
        setPhase('idle'); // cancel any in-progress exit animation
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

    // Discount the empty-circle phase before comparing against the threshold
    const pulledEnough = pullPosition - 30 >= refreshThreshold;

    pullStartRef.current = null;
    isDraggingRef.current = false;

    if (!pulledEnough) {
      setPullPosition(0);
      return;
    }

    // Enter the refreshing state immediately, even on routes without active query observers.
    setPhase('refreshing');
    setPullPosition(0);
    sawFetchRef.current = false;

    Promise.resolve(onRefresh()).finally(() => {
      // Static routes have nothing to refetch, so skip the animation and hard-reload.
      if (!sawFetchRef.current) {
        window.location.reload();
        return;
      }
      setPhase('exiting');
    });
  }, [isDisabled, pullPosition, refreshThreshold, onRefresh]);

  useEffect(() => {
    if (isRefreshing && isFetching) sawFetchRef.current = true;
  }, [isRefreshing, isFetching]);

  useEffect(() => {
    if (isDisabled) return;

    // Non-passive so onPull can preventDefault; otherwise the browser's own pull-to-refresh wins
    const options = { passive: false };

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

  // First 30px of pull just shows the empty circle, progress starts after that
  const emptyPhase = 30;
  const progressPull = Math.max(0, pullPosition - emptyPhase);
  const clamped = Math.min(progressPull, refreshThreshold);
  const progress = clamped / refreshThreshold;

  // Rings thicken inward from a fixed outer edge at radius 20 as the pull grows
  const stroke = isActive ? 6 : 3 + progress * 1.5;
  // Background extends 2px beyond the foreground on each side for padding.
  const backgroundStroke = stroke + 4;
  const radius = 20 - backgroundStroke / 2;
  const circumference = 2 * Math.PI * radius;

  // While refreshing the ring "explodes" into evenly spaced dashes that spin.
  const explodedSegments = 16;
  const explodedSegment = circumference / explodedSegments;
  const explodedDash = explodedSegment * 0.65;
  const explodedGap = explodedSegment * 0.35;
  const explodedDashArray = `${explodedDash} ${explodedGap}`;

  const strokeDashoffset = circumference * (1 - progress);

  if (!isPulling && phase === 'idle') return null;

  const isExiting = phase === 'exiting';
  const top = isExiting ? -20 : isRefreshing ? 48 : Math.min(pullPosition / 1.5, 120);
  const opacity = isExiting ? 0 : isActive || pullPosition > 0 ? 1 : 0;
  const transition = isDraggingRef.current
    ? 'none'
    : isExiting
      ? `top ${exitDuration}ms ease-in ${exitHold}ms, opacity ${exitDuration}ms ease-in ${exitHold}ms`
      : 'top 0.3s ease-out, opacity 0.3s ease-out';

  return (
    <div
      onTransitionEnd={(e) => {
        if (isExiting && e.propertyName === 'opacity') setPhase('idle');
      }}
      style={{
        top,
        opacity,
        transition,
      }}
      className="fixed inset-x-1/2 z-300 h-8 w-8 -translate-x-1/2 bg-base-100"
    >
      <svg
        className={`h-8 w-8 ${isActive ? 'animate-spin' : ''}`}
        viewBox="0 0 40 40"
        style={{
          transform: isActive ? undefined : `rotate(${pullPosition * 2}deg)`,
          transition: isActive ? 'none' : 'transform 0.1s ease-out',
        }}
      >
        <title>Pull to refresh</title>
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={backgroundStroke}
          className="text-muted-foreground/50"
          style={{ transition: 'stroke-width 0.15s ease-out' }}
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={isActive ? explodedDashArray : circumference}
          strokeDashoffset={isActive ? 0 : strokeDashoffset}
          strokeLinecap={isActive ? 'butt' : 'round'}
          className="text-foreground"
          style={{ transition: 'stroke-width 0.15s ease-out' }}
        />
      </svg>
    </div>
  );
}
