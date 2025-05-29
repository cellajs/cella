import { Circle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBodyClassPresence } from '~/hooks/use-body-class-presence';

type Props = {
  onRefresh: () => void | Promise<void>;
  refreshThreshold?: number;
  maximumPullLength?: number;
  isDisabled?: boolean;
};

const PullToRefresh = ({ onRefresh, refreshThreshold = 100, maximumPullLength = 200, isDisabled = false }: Props) => {
  const [pullPosition, setPullPosition] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const pullStartRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  const isPulling = pullPosition > 0;

  // If dialoger, dropdowner or sheeter are open, disable pull to refresh
  const isUIBlocking = useBodyClassPresence(['dropdowner-open', 'sheeter-open', 'dialoger-open']);
  if (isUIBlocking) isDisabled = true;

  const startPull = useCallback(
    (e: TouchEvent) => {
      if (isDisabled || window.scrollY > 0) return;

      const touch = e.targetTouches[0];
      const pullArea = window.innerHeight * 0.4;

      if (touch.clientY <= pullArea) {
        pullStartRef.current = touch.screenY;
        isDraggingRef.current = true;
      }
    },
    [isDisabled],
  );

  const onPull = useCallback(
    (e: TouchEvent) => {
      if (isDisabled || !isDraggingRef.current || pullStartRef.current === null) return;

      const touch = e.targetTouches[0];
      if (!touch) return;

      const delta = touch.screenY - pullStartRef.current;
      const clamped = Math.max(0, Math.min(delta, maximumPullLength));

      setPullPosition(clamped);
    },
    [isDisabled, maximumPullLength],
  );

  const endPull = useCallback(() => {
    if (isDisabled || !isDraggingRef.current) return;

    const pulledEnough = pullPosition >= refreshThreshold;

    pullStartRef.current = null;
    isDraggingRef.current = false;
    setPullPosition(0);

    if (!pulledEnough) return;

    setIsRefreshing(true);
    const result = onRefresh();

    if (result instanceof Promise) {
      result.finally(() => setIsRefreshing(false));
    } else {
      setIsRefreshing(false);
    }
  }, [isDisabled, pullPosition, refreshThreshold, onRefresh]);

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
  const clamped = Math.min(pullPosition, refreshThreshold);
  const progress = clamped / refreshThreshold;
  const strokeDashoffset = circumference * (1 - progress);

  if (!isPulling) return null;

  return (
    <>
      <div
        style={{
          top: (isRefreshing ? 100 : pullPosition) / 3,
          opacity: isRefreshing || pullPosition > 0 ? 1 : 0,
        }}
        className="bg-base-100 fixed inset-x-1/2 z-300 h-8 w-8 -translate-x-1/2"
      >
        <Circle className="absolute w-8 h-8 text-background/50" strokeWidth={4} />
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
            className="text-muted-foreground"
          />
        </svg>
      </div>
    </>
  );
};

export default PullToRefresh;
