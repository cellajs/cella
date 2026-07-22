// https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values
const nonInputKeys = new Set([
  // Special keys
  'Unidentified',
  // Modifier keys
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
  // Whitespace keys
  'Tab',
  // Navigation keys
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
  // Editing
  'Insert',
  // UI keys
  'ContextMenu',
  'Escape',
  'Pause',
  'Play',
  // Device keys
  'PrintScreen',
  // Function keys
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

export function isCtrlKeyHeldDown(e: React.KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && e.key !== 'Control';
}

// event.keyCode remains stable when event.key differs by keyboard input language.
// event.nativeEvent.code cannot be used either as it would break copy/paste for the DVORAK layout
const vKey = 86;

export function isDefaultCellInput(event: React.KeyboardEvent<HTMLDivElement>, isUserHandlingPaste: boolean): boolean {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  if (isCtrlKeyHeldDown(event) && (event.keyCode !== vKey || isUserHandlingPaste)) return false;
  return !nonInputKeys.has(event.key);
}

/** Allow Tab navigation from a sole input, textarea, or select inside the editor container. */
export function onEditorNavigation({ key, target }: React.KeyboardEvent<HTMLDivElement>): boolean {
  if (
    key === 'Tab' &&
    (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)
  ) {
    return target.closest('.rdg-editor-container')?.querySelectorAll('input, textarea, select').length === 1;
  }
  return false;
}

export function getLeftRightKey() {
  return {
    leftKey: 'ArrowLeft',
    rightKey: 'ArrowRight',
  } as const;
}
