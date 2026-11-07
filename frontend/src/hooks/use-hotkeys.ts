import { useEffect } from 'react';

type KeyboardModifiers = { alt: boolean; ctrl: boolean; meta: boolean; mod: boolean; shift: boolean };

type Hotkey = KeyboardModifiers & { key?: string };

const modifierKeys = ['alt', 'ctrl', 'meta', 'shift', 'mod'];

function parseHotkey(hotkey: string): Hotkey {
  const keys =
    hotkey === '+'
      ? ['+']
      : hotkey
          .toLowerCase()
          .split('+')
          .map((part) => part.trim());

  const modifiers: KeyboardModifiers = {
    alt: keys.includes('alt'),
    ctrl: keys.includes('ctrl'),
    meta: keys.includes('meta'),
    mod: keys.includes('mod'),
    shift: keys.includes('shift'),
  };

  const freeKey = keys.find((key) => !modifierKeys.includes(key));

  return { ...modifiers, key: freeKey };
}

function isExactHotkey(hotkey: Hotkey, event: KeyboardEvent): boolean {
  const { alt, ctrl, meta, mod, shift, key } = hotkey;
  const { altKey, ctrlKey, metaKey, shiftKey, key: pressedKey } = event;

  // Mod is Ctrl or Meta, whichever the platform uses, so it stands in for both exact checks
  const modifierMatch = mod ? ctrlKey || metaKey : ctrl === ctrlKey && meta === metaKey;
  if (alt !== altKey || shift !== shiftKey || !modifierMatch) return false;

  const lowerKey = key?.toLowerCase();
  return !!lowerKey && (pressedKey.toLowerCase() === lowerKey || event.code.replace('Key', '').toLowerCase() === lowerKey);
}

type HotkeyItem = [string, (event: KeyboardEvent) => void, { preventDefault?: boolean }?];

export function shouldFireEvent(event: KeyboardEvent, tagsToIgnore: string[], triggerOnContentEditable = false) {
  if (event.target instanceof HTMLElement) {
    if (triggerOnContentEditable) return !tagsToIgnore.includes(event.target.tagName);
    return !event.target.isContentEditable && !tagsToIgnore.includes(event.target.tagName);
  }
  return true;
}

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
        if (isExactHotkey(parseHotkey(hotkey), event) && shouldFireEvent(event, tagsToIgnore, triggerOnContentEditable)) {
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
