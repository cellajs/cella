type KeyboardModifiers = { alt: boolean; ctrl: boolean; meta: boolean; mod: boolean; shift: boolean };

type Hotkey = KeyboardModifiers & { key?: string };

type HotkeyMatcher = (event: KeyboardEvent) => boolean;

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

  const reservedKeys = ['alt', 'ctrl', 'meta', 'shift', 'mod'];

  const freeKey = keys.find((key) => !reservedKeys.includes(key));

  return { ...modifiers, key: freeKey };
}

function isExactHotkey(hotkey: Hotkey, event: KeyboardEvent): boolean {
  const { alt, ctrl, meta, mod, shift, key } = hotkey;
  const { altKey, ctrlKey, metaKey, shiftKey, key: pressedKey } = event;

  // Mod is Ctrl or Meta, whichever the platform uses, so it stands in for both exact checks
  const modifierMatch = mod ? ctrlKey || metaKey : ctrl === ctrlKey && meta === metaKey;
  if (alt !== altKey || shift !== shiftKey || !modifierMatch) return false;

  const lowerKey = key?.toLowerCase();
  if (lowerKey && (pressedKey.toLowerCase() === lowerKey || event.code.replace('Key', '').toLowerCase() === lowerKey)) {
    return true;
  }

  return false;
}

export function getHotkeyMatcher(hotkey: string): HotkeyMatcher {
  return (event) => isExactHotkey(parseHotkey(hotkey), event);
}

interface HotkeyItemOptions {
  preventDefault?: boolean;
}

type HotkeyItem = [string, (event: KeyboardEvent) => void, HotkeyItemOptions?];

export function shouldFireEvent(event: KeyboardEvent, tagsToIgnore: string[], triggerOnContentEditable = false) {
  if (event.target instanceof HTMLElement) {
    if (triggerOnContentEditable) {
      return !tagsToIgnore.includes(event.target.tagName);
    }
    return !event.target.isContentEditable && !tagsToIgnore.includes(event.target.tagName);
  }
  return true;
}
export type { HotkeyItem };
