import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { useUIStore } from '~/modules/ui/ui-store';

// Hold the indicator still briefly, then glide it off-screen (ms).
const exitHold = 100;
const exitDuration = 450;
// Minimum swipe distance before the pull-to-refresh UI appears and starts counting (px).
const activationThreshold = 30;
// First 30px of pull just shows the empty circle, progress starts after that (px).
const emptyPhase = 30;

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
  refreshThreshold?: number;
  maximumPullLength?: number;
  isDisabled?: boolean;
};

export function PullToRefresh({ onRefresh, refreshThreshold = 90, maximumPullLength = 200, isDisabled = false }: Props) {
  const queryClient = useQueryClient();
  const [pullPosition, setPullPosition] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');

  const pullStartRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  // Mirrors pullPosition for the touch handlers, so they are not re-bound on every move
  const pullPositionRef = useRef(0);
  // Whether any query actually fetched during the current refresh cycle.
  const sawFetchRef = useRef(false);
  const onRefreshRef = useLatestRef(onRefresh);

  const isRefreshing = phase === 'refreshing';
  // Indicator stays styled as a spinner through both refreshing and exiting.
  const isActive = phase !== 'idle';
  const isPulling = pullPosition > 0;

  // Disabled while an overlay is open (dialog, dropdown, sheet)
  const isUILocked = useUIStore((state) => state.uiLocks.length > 0);
  const disabled = isDisabled || isUILocked;

  // Watches the query cache only while refreshing, so fetches at other times never re-render this
  useEffect(() => {
    if (!isRefreshing) return;
    const check = () => {
      if (!sawFetchRef.current && queryClient.isFetching() > 0) sawFetchRef.current = true;
    };
    check();
    return queryClient.getQueryCache().subscribe(check);
  }, [isRefreshing, queryClient]);

  useEffect(() => {
    if (disabled) return;

    const setPull = (position: number) => {
      pullPositionRef.current = position;
      setPullPosition(position);
    };

    const cancelPull = () => {
      pullStartRef.current = null;
      isDraggingRef.current = false;
      setPull(0);
    };

    const startPull = (e: TouchEvent) => {
      const touch = e.targetTouches[0];
      if (!touch || touch.clientY > window.innerHeight * 0.4 || window.scrollY > 0) return;

      // Only start at the top of the touch target's scroll parent; the walk reads styles, so it runs last
      const scrollParent = getScrollParent(e.target as Element | null);
      if (scrollParent && scrollParent.scrollTop > 0) return;

      setPhase('idle'); // cancel any in-progress exit animation
      pullStartRef.current = touch.screenY;
      isDraggingRef.current = true;
    };

    const onPull = (e: TouchEvent) => {
      if (!isDraggingRef.current || pullStartRef.current === null) return;

      const touch = e.targetTouches[0];
      if (!touch) return;

      const rawDelta = touch.screenY - pullStartRef.current;
      if (rawDelta < activationThreshold) {
        setPull(0);
        return;
      }

      setPull(Math.max(0, Math.min(rawDelta - activationThreshold, maximumPullLength)));
    };

    const endPull = () => {
      if (!isDraggingRef.current) return;

      // Discount the empty-circle phase before comparing against the threshold
      const pulledEnough = pullPositionRef.current - emptyPhase >= refreshThreshold;
      cancelPull();
      if (!pulledEnough) return;

      // Enter the refreshing state immediately, even on routes without active query observers.
      setPhase('refreshing');
      sawFetchRef.current = false;

      Promise.resolve(onRefreshRef.current()).finally(() => {
        // Static routes have nothing to refetch, so skip the animation and hard-reload.
        if (!sawFetchRef.current) {
          window.location.reload();
          return;
        }
        setPhase('exiting');
      });
    };

    // Native pull-to-refresh is off through overscroll-none on html and body, so the listeners stay passive
    window.addEventListener('touchstart', startPull, { passive: true });
    window.addEventListener('touchmove', onPull, { passive: true });
    window.addEventListener('touchend', endPull);
    // A touch the browser takes over (scroll, system gesture) must not leave the pull half-drawn
    window.addEventListener('touchcancel', cancelPull);

    return () => {
      window.removeEventListener('touchstart', startPull);
      window.removeEventListener('touchmove', onPull);
      window.removeEventListener('touchend', endPull);
      window.removeEventListener('touchcancel', cancelPull);
      // An overlay opening mid-pull disables this: drop the pull so it never freezes on screen
      cancelPull();
    };
  }, [disabled, maximumPullLength, refreshThreshold]);

  useEffect(() => {
    const className = 'overflow-hidden';

    isPulling ? document.body.classList.add(className) : document.body.classList.remove(className);

    return () => {
      document.body.classList.remove(className);
    };
  }, [isPulling]);

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
  // Moved by transform, so the release and exit glides run on the compositor while the refresh re-renders the page
  const offset = isExiting ? -20 : isRefreshing ? 48 : Math.min(pullPosition / 1.5, 120);
  const opacity = isExiting ? 0 : isActive || pullPosition > 0 ? 1 : 0;
  const transition = isDraggingRef.current
    ? 'none'
    : isExiting
      ? `transform ${exitDuration}ms ease-in ${exitHold}ms, opacity ${exitDuration}ms ease-in ${exitHold}ms`
      : 'transform 0.3s ease-out, opacity 0.3s ease-out';

  return (
    <div
      onTransitionEnd={(e) => {
        if (isExiting && e.propertyName === 'opacity') setPhase('idle');
      }}
      style={{ transform: `translateY(${offset}px)`, opacity, transition }}
      className="fixed inset-x-1/2 top-0 z-300 h-8 w-8 -translate-x-1/2"
    >
      <svg
        className={`h-8 w-8 ${isActive ? 'animate-spin' : ''}`}
        viewBox="0 0 40 40"
        style={isActive ? { transition: 'none' } : { transform: `rotate(${pullPosition * 2}deg)`, transition: 'transform 0.1s ease-out' }}
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
