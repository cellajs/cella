// https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values
const nonInputKeys = new Set([
  'Unidentified',
  'Alt',
  'AltGraph',
  'CapsLock',
  'Control',
  'Fn',
  'FnLock',
  'Meta',
  'NumLock',
  'ScrollLock',
  'Shift',
  'Tab',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
  'Insert',
  'ContextMenu',
  'Escape',
  'Pause',
  'Play',
  'PrintScreen',
  'F1',
  // 'F2', /!\ specifically allowed, do not edit
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
]);

export const isCtrlKeyHeldDown = (e: React.KeyboardEvent): boolean => (e.ctrlKey || e.metaKey) && e.key !== 'Control';

// event.keyCode stays stable across keyboard languages, and event.nativeEvent.code would break copy/paste on DVORAK.
const vKey = 86;

/** Checks whether a key event should start the default cell editor. */
export function isDefaultCellInput(event: React.KeyboardEvent<HTMLDivElement>, isUserHandlingPaste: boolean): boolean {
  if (isCtrlKeyHeldDown(event) && (event.keyCode !== vKey || isUserHandlingPaste)) return false;
  return !nonInputKeys.has(event.key);
}

/** Allow Tab navigation from a sole input, textarea, or select inside the editor container. */
export function onEditorNavigation({ key, target }: React.KeyboardEvent<HTMLDivElement>): boolean {
  if (key === 'Tab' && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
    return target.closest('.rdg-editor-container')?.querySelectorAll('input, textarea, select').length === 1;
  }
  return false;
}
