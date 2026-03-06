import { Children, cloneElement, type HTMLAttributes, isValidElement, type ReactNode } from 'react';

/**
 * Merges Slot props onto the child element's props.
 * - Event handlers (on*) are composed so both fire
 * - className values are concatenated
 * - style objects are shallow-merged (child wins)
 * - All other props: child's value wins
 */
function mergeProps(slotProps: Record<string, unknown>, childProps: Record<string, unknown>) {
  const merged: Record<string, unknown> = { ...slotProps };

  for (const key of Object.keys(childProps)) {
    const slotVal = slotProps[key];
    const childVal = childProps[key];

    if (key === 'className') {
      merged[key] = [slotVal, childVal].filter(Boolean).join(' ');
    } else if (key === 'style' && typeof slotVal === 'object' && typeof childVal === 'object') {
      merged[key] = { ...(slotVal as object), ...(childVal as object) };
    } else if (/^on[A-Z]/.test(key) && typeof slotVal === 'function' && typeof childVal === 'function') {
      merged[key] = (...args: unknown[]) => {
        (childVal as Function)(...args);
        (slotVal as Function)(...args);
      };
    } else {
      merged[key] = childVal;
    }
  }

  return merged;
}

/**
 * Renders its single child element with the Slot's own props merged in.
 */
export function Slot({ children, ...slotProps }: HTMLAttributes<HTMLElement> & { children?: ReactNode }) {
  if (isValidElement(children)) {
    return cloneElement(children, mergeProps(slotProps, children.props as Record<string, unknown>));
  }

  if (Children.count(children) > 1) {
    Children.only(null); // throws
  }

  return null;
}
