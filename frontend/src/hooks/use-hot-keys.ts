import * as React from 'react';

import { type HotkeyItem, getHotkeyMatcher, shouldFireEvent } from '~/hooks/use-hot-keys-helpers';

export function useHotkeys(
  hotkeys: HotkeyItem[],
  tagsToIgnore: string[] = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'],
  triggerOnContentEditable = false,
) {
  React.useEffect(() => {
    const keydownListener = (event: KeyboardEvent) => {
      const isFormElement = tagsToIgnore.some((tag) => event.target instanceof HTMLElement && event.target.closest(tag));
      if (isFormElement) return; // Ignore if the event target is within a form element
      for (const [hotkey, handler, options = { preventDefault: true }] of hotkeys) {
        if (getHotkeyMatcher(hotkey)(event) && shouldFireEvent(event, tagsToIgnore, triggerOnContentEditable)) {
          if (options.preventDefault) event.preventDefault();
          handler(event);
        }
      }
    };

    document.documentElement.addEventListener('keydown', keydownListener);
    return () => document.documentElement.removeEventListener('keydown', keydownListener);
  }, [hotkeys, tagsToIgnore, triggerOnContentEditable]);
}
