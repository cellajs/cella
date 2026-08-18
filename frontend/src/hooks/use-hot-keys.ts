import { useEffect } from 'react';
import { getHotkeyMatcher, type HotkeyItem, shouldFireEvent } from '~/hooks/use-hot-keys-helpers';

/** Register global shortcuts as `[combination, handler, options?]` tuples. */
export function useHotkeys(
  hotkeys: HotkeyItem[],
  tagsToIgnore: string[] = ['INPUT', 'TEXTAREA', 'SELECT'],
  triggerOnContentEditable = false,
) {
  useEffect(() => {
    const keydownListener = (event: KeyboardEvent) => {
      const isFormElement = tagsToIgnore.some(
        (tag) => event.target instanceof HTMLElement && event.target.closest(tag),
      );
      if (isFormElement) return;

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
