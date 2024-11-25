import * as React from 'react';

import { type HotkeyItem, getHotkeyMatcher, shouldFireEvent } from '~/hooks/use-hot-keys-helpers';

// Custom hook for handling global hotkeys
export function useHotkeys(
  hotkeys: HotkeyItem[],
  tagsToIgnore: string[] = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'], // HTML tags to ignore
  triggerOnContentEditable = false, // Whether to trigger hotkeys in content editable elements
) {
  React.useEffect(() => {
    const keydownListener = (event: KeyboardEvent) => {
      // Check if the event target is within an ignored HTML element
      const isFormElement = tagsToIgnore.some((tag) => event.target instanceof HTMLElement && event.target.closest(tag));
      if (isFormElement) return; // Skip handling if within ignored element

      // Iterate through hotkeys and check if any match the event
      for (const [hotkey, handler, options = { preventDefault: true }] of hotkeys) {
        // Check if the hotkey matches and if the event should fire
        if (getHotkeyMatcher(hotkey)(event) && shouldFireEvent(event, tagsToIgnore, triggerOnContentEditable)) {
          if (options.preventDefault) event.preventDefault(); // Prevent default action if specified
          handler(event); // Execute the hotkey handler
        }
      }
    };

    document.documentElement.addEventListener('keydown', keydownListener);
    return () => document.documentElement.removeEventListener('keydown', keydownListener);
  }, [hotkeys, tagsToIgnore, triggerOnContentEditable]);
}
