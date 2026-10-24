import { useEffect } from 'react';
import { getHotkeyMatcher, type HotkeyItem, shouldFireEvent } from '~/hooks/use-hotkeys-helpers';

const defaultIgnoredTags = ['INPUT', 'TEXTAREA', 'SELECT'];

/** Register global shortcuts as `[combination, handler, options?]` tuples. */
export function useHotkeys(hotkeys: HotkeyItem[], tagsToIgnore: string[] = defaultIgnoredTags, triggerOnContentEditable = false) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // A key the focused control already handled, e.g. Enter or an arrow in a menu, is not a shortcut
      if (event.defaultPrevented) return;
      const isFormElement = tagsToIgnore.some((tag) => event.target instanceof HTMLElement && event.target.closest(tag));
      if (isFormElement) return;

      for (const [hotkey, handler, options] of hotkeys) {
        if (getHotkeyMatcher(hotkey)(event) && shouldFireEvent(event, tagsToIgnore, triggerOnContentEditable)) {
          // Without options a hotkey prevents the default; with options only when they say so.
          if (options ? options.preventDefault : true) event.preventDefault();
          handler(event);
        }
      }
    };

    document.documentElement.addEventListener('keydown', handleKeyDown);
    return () => document.documentElement.removeEventListener('keydown', handleKeyDown);
  }, [hotkeys, tagsToIgnore, triggerOnContentEditable]);
}
