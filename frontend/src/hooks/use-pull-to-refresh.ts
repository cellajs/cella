import { useCallback, useEffect, useState } from 'react';

type UsePullToRefreshParams = {
  onRefresh: () => void | Promise<void>;
  maximumPullLength?: number;
  refreshThreshold?: number;
  isDisabled?: boolean;
};

type UsePullToRefreshReturn = {
  isRefreshing: boolean;
  pullPosition: number;
};

type UsePullToRefresh = (params: UsePullToRefreshParams) => UsePullToRefreshReturn;

const isValid = (maximumPullLength: number, refreshThreshold: number) => maximumPullLength >= refreshThreshold;

/**
 * Hook to implement pull-to-refresh functionality.
 *
 * @link https://github.com/Senbonzakura1234/use-pull-to-refresh
 */
export const usePullToRefresh: UsePullToRefresh = ({
  onRefresh,
  maximumPullLength = 200,
  refreshThreshold = 100,
  isDisabled = false,
}: UsePullToRefreshParams) => {
  const [pullStartPosition, setPullStartPosition] = useState<number | null>(null);
  const [pullPosition, setPullPosition] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onPullStart = useCallback(
    ({ targetTouches }: TouchEvent) => {
      if (isDisabled || window.scrollY > 0) return;

      const touch = targetTouches[0];
      if (!touch) return;

      const pullAreaHeight = window.innerHeight * 0.4;
      if (touch.clientY <= pullAreaHeight) {
        setPullStartPosition(touch.screenY);
      }
    },
    [isDisabled],
  );

  const onPulling = useCallback(
    ({ targetTouches }: TouchEvent) => {
      if (isDisabled || pullStartPosition === null) return;

      const touch = targetTouches[0];
      if (!touch) return;

      const currentPullLength = touch.screenY > pullStartPosition ? Math.min(touch.screenY - pullStartPosition, maximumPullLength) : 0;

      setPullPosition(currentPullLength);
    },
    [isDisabled, pullStartPosition, maximumPullLength],
  );

  const onEndPull = useCallback(() => {
    if (isDisabled || pullStartPosition === null) return;

    setPullStartPosition(null);
    setPullPosition(0);

    if (pullPosition < refreshThreshold) return;

    setIsRefreshing(true);
    const result = onRefresh();

    if (result instanceof Promise) {
      result.finally(() => setIsRefreshing(false));
    } else {
      setIsRefreshing(false);
    }
  }, [isDisabled, onRefresh, pullPosition, refreshThreshold, pullStartPosition]);

  useEffect(() => {
    if (typeof window === 'undefined' || isDisabled) return;

    const handleTouchStart = (e: TouchEvent) => onPullStart(e);
    const handleTouchMove = (e: TouchEvent) => {
      onPulling(e);
      if (onPullStart !== null && window.scrollY === 0) {
        // Only prevent scroll if pull is active at the top
        e.preventDefault();
      }
    };
    const handleTouchEnd = () => onEndPull();

    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDisabled, onPullStart, onPulling, onEndPull]);

  useEffect(() => {
    if (isValid(maximumPullLength, refreshThreshold) || process.env.NODE_ENV === 'production' || isDisabled) return;

    console.warn('usePullToRefresh:', `'maximumPullLength' (${maximumPullLength}) should be >= 'refreshThreshold' (${refreshThreshold})`);
  }, [maximumPullLength, refreshThreshold, isDisabled]);

  return { isRefreshing, pullPosition };
};
