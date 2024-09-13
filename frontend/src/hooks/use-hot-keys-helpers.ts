type KeyboardModifiers = {
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  mod: boolean;
  shift: boolean;
};

type Hotkey = KeyboardModifiers & {
  key?: string;
};

type CheckHotkeyMatch = (event: KeyboardEvent) => boolean;

// Parses a hotkey string into a Hotkey object with modifiers and a key
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

  // Keys that are reserved for modifiers
  const reservedKeys = ['alt', 'ctrl', 'meta', 'shift', 'mod'];

  // Find the non-modifier key
  const freeKey = keys.find((key) => !reservedKeys.includes(key));

  return {
    ...modifiers,
    key: freeKey,
  };
}

// Checks if the given KeyboardEvent matches the specified hotkey
function isExactHotkey(hotkey: Hotkey, event: KeyboardEvent): boolean {
  const { alt, ctrl, meta, mod, shift, key } = hotkey;
  const { altKey, ctrlKey, metaKey, shiftKey, key: pressedKey } = event;

  // Check modifiers
  if (alt !== altKey || (mod && !(ctrlKey || metaKey)) || ctrl !== ctrlKey || meta !== metaKey || shift !== shiftKey) {
    return false;
  }

  // Check the actual key press
  if (key && (pressedKey.toLowerCase() === key.toLowerCase() || event.code.replace('Key', '').toLowerCase() === key.toLowerCase())) {
    return true;
  }

  return false;
}

// check if a KeyboardEvent matches the specified hotkey string
function getHotkeyMatcher(hotkey: string): CheckHotkeyMatch {
  return (event) => isExactHotkey(parseHotkey(hotkey), event);
}

interface HotkeyItemOptions {
  preventDefault?: boolean;
}

type HotkeyItem = [string, (event: KeyboardEvent) => void, HotkeyItemOptions?];

// Determines whether the event should trigger the hotkey handler based on the target element and settings
function shouldFireEvent(event: KeyboardEvent, tagsToIgnore: string[], triggerOnContentEditable = false) {
  if (event.target instanceof HTMLElement) {
    if (triggerOnContentEditable) {
      return !tagsToIgnore.includes(event.target.tagName);
    }
    return !event.target.isContentEditable && !tagsToIgnore.includes(event.target.tagName);
  }
  return true;
}

export { getHotkeyMatcher, shouldFireEvent };
export type { HotkeyItem };
