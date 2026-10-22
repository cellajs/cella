// @vitest-environment jsdom
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fallbackContentRef } from '~/utils/fallback-content-ref';
import { type DialogData, useDialoger } from './use-dialoger';

const dialog = (id: number | string, data: Partial<DialogData> = {}): DialogData => ({ id, triggerRef: createRef(), ...data });

const openIds = () => useDialoger.getState().dialogs.map((d) => d.id);

describe('dialoger store', () => {
  beforeEach(() => {
    useDialoger.setState({ dialogs: [] });
    fallbackContentRef.current = null;
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the defaults for options passed as undefined', () => {
    useDialoger.getState().create(null, dialog('a', { drawerOnMobile: undefined, headerClassName: undefined }));

    expect(useDialoger.getState().get('a')).toMatchObject({ drawerOnMobile: true, headerClassName: 'with-close-btn' });
  });

  it('removes only the dialog with id 0', () => {
    useDialoger.getState().create(null, dialog(0));
    useDialoger.getState().create(null, dialog(1));

    useDialoger.getState().remove(0);

    expect(openIds()).toEqual([1]);
  });

  it('blurs a focused button and stashes it as the focus fallback', () => {
    const button = document.body.appendChild(document.createElement('button'));
    button.focus();

    useDialoger.getState().create(null, dialog('a'));

    expect(fallbackContentRef.current).toBe(button);
    expect(document.activeElement).not.toBe(button);
  });
});
