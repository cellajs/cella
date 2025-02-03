import * as React from 'react';

/**
 * Prevents body scroll by locking the body's overflow style.
 *
 * Resets the overflow style when the component using this hook is unmounted.
 */
// @see https://usehooks.com/useLockBodyScroll.
export function useLockBody() {
  React.useLayoutEffect((): (() => void) => {
    const originalStyle: string = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);
}
