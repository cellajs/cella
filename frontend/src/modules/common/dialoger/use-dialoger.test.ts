// @vitest-environment jsdom
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fallbackContentRef } from '~/utils/fallback-content-ref';
import { type DialogData, useDialoger } from './use-dialoger';

const dialog = (id: number | string, data: Partial<DialogData> = {}): DialogData => ({
  id,
  triggerRef: createRef(),
  ...data,
});

const openIds = () => useDialoger.getState().dialogs.map((d) => d.id);

describe('dialoger store', () => {
  beforeEach(() => {
    useDialoger.setState({ dialogs: [] });
    fallbackContentRef.current = null;
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens a dialog with its defaults and returns its id', () => {
    const id = useDialoger.getState().create('content', dialog('a', { title: 'A' }));

    expect(id).toBe('a');
    expect(useDialoger.getState().get('a')).toMatchObject({
      id: 'a',
      title: 'A',
      content: 'content',
      open: true,
      drawerOnMobile: true,
      headerClassName: 'with-close-btn',
    });
  });

  it('lets data override the defaults', () => {
    useDialoger.getState().create(null, dialog('a', { drawerOnMobile: false, headerClassName: 'custom' }));

    expect(useDialoger.getState().get('a')).toMatchObject({ drawerOnMobile: false, headerClassName: 'custom' });
  });

  it('keeps the defaults for options passed as undefined', () => {
    useDialoger.getState().create(null, dialog('a', { drawerOnMobile: undefined, headerClassName: undefined }));

    expect(useDialoger.getState().get('a')).toMatchObject({ drawerOnMobile: true, headerClassName: 'with-close-btn' });
  });

  it('replaces a dialog opened with the same id and moves it last', () => {
    useDialoger.getState().create('first', dialog('a'));
    useDialoger.getState().create(null, dialog(2));
    useDialoger.getState().create('second', dialog('a'));

    expect(openIds()).toEqual([2, 'a']);
    expect(useDialoger.getState().get('a')?.content).toBe('second');
  });

  it('merges updates into one dialog', () => {
    useDialoger.getState().create(null, dialog('a', { title: 'A' }));
    useDialoger.getState().create(null, dialog('b', { title: 'B' }));

    useDialoger.getState().update('a', { open: false, title: 'A2' });

    expect(useDialoger.getState().get('a')).toMatchObject({ open: false, title: 'A2' });
    expect(useDialoger.getState().get('b')).toMatchObject({ open: true, title: 'B' });
  });

  it('removes the dialog from the store before onClose runs', () => {
    let idsDuringClose: (string | number)[] | null = null;
    useDialoger.getState().create(null, dialog('a', { onClose: () => (idsDuringClose = openIds()) }));
    useDialoger.getState().create(null, dialog('b'));

    useDialoger.getState().remove('a');

    expect(idsDuringClose).toEqual(['b']);
    expect(openIds()).toEqual(['b']);
  });

  it('passes isCleanup to onClose', () => {
    const onClose = vi.fn();
    useDialoger.getState().create(null, dialog('a', { onClose }));
    useDialoger.getState().create(null, dialog('b', { onClose }));

    useDialoger.getState().remove('a', { isCleanup: true });
    useDialoger.getState().remove('b');

    expect(onClose.mock.calls).toEqual([[true], [undefined]]);
  });

  it('keeps a dialog that onClose opens', () => {
    useDialoger
      .getState()
      .create(null, dialog('a', { onClose: () => useDialoger.getState().create(null, dialog('b')) }));

    useDialoger.getState().remove('a');

    expect(openIds()).toEqual(['b']);
  });

  it('removes every dialog without an id and calls each onClose in order', () => {
    const closed: string[] = [];
    useDialoger.getState().create(null, dialog('a', { onClose: () => closed.push('a') }));
    useDialoger.getState().create(null, dialog('b', { onClose: () => closed.push('b') }));

    useDialoger.getState().remove();

    expect(openIds()).toEqual([]);
    expect(closed).toEqual(['a', 'b']);
  });

  it('removes only the dialog with id 0', () => {
    useDialoger.getState().create(null, dialog(0));
    useDialoger.getState().create(null, dialog(1));

    useDialoger.getState().remove(0);

    expect(openIds()).toEqual([1]);
  });

  it('leaves the store untouched when nothing matches', () => {
    useDialoger.getState().create(null, dialog('a'));
    const before = useDialoger.getState().dialogs;

    useDialoger.getState().remove('missing');

    expect(useDialoger.getState().dialogs).toBe(before);
  });

  it('blurs a focused button and stashes it as the focus fallback', () => {
    const button = document.body.appendChild(document.createElement('button'));
    button.focus();

    useDialoger.getState().create(null, dialog('a'));

    expect(fallbackContentRef.current).toBe(button);
    expect(document.activeElement).not.toBe(button);
  });

  it('leaves a focused input focused and the fallback unchanged', () => {
    const input = document.body.appendChild(document.createElement('input'));
    input.focus();

    useDialoger.getState().create(null, dialog('a'));

    expect(fallbackContentRef.current).toBeNull();
    expect(document.activeElement).toBe(input);
  });
});
