// @vitest-environment jsdom
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fallbackContentRef } from '~/utils/fallback-content-ref';
import { type SheetData, sheeter, useSheeter } from './use-sheeter';

const sheet = (id: string, data: Partial<SheetData> = {}): SheetData => ({ id, side: 'right', triggerRef: createRef(), ...data });

const openIds = () => useSheeter.getState().sheets.map((s) => s.id);

describe('sheeter close order', () => {
  beforeEach(() => useSheeter.setState({ sheets: [] }));

  it('removes the sheet from the store before onClose runs', () => {
    let idsDuringClose: string[] | null = null;
    useSheeter.getState().create(null, sheet('a', { onClose: () => (idsDuringClose = openIds()) }));

    useSheeter.getState().remove('a');

    expect(idsDuringClose).toEqual([]);
  });

  it('keeps a sheet that onClose opens', () => {
    useSheeter.getState().create(null, sheet('a', { onClose: () => useSheeter.getState().create(null, sheet('b')) }));

    useSheeter.getState().remove('a');

    expect(openIds()).toEqual(['b']);
  });

  it('closes only route-bound sheets on a route change', () => {
    const closed: string[] = [];
    useSheeter.getState().create(null, sheet('route', { onClose: () => closed.push('route') }));
    useSheeter.getState().create(null, sheet('pinned', { closeSheetOnRouteChange: false, onClose: () => closed.push('pinned') }));

    useSheeter.getState().removeOnRouteChange();

    expect(closed).toEqual(['route']);
    expect(openIds()).toEqual(['pinned']);
  });

  it('closes a sheet created with an undefined closeSheetOnRouteChange on a route change', () => {
    useSheeter.getState().create(null, sheet('a', { closeSheetOnRouteChange: undefined }));

    expect(useSheeter.getState().get('a')?.closeSheetOnRouteChange).toBe(true);
    useSheeter.getState().removeOnRouteChange();

    expect(openIds()).toEqual([]);
  });
});

describe('sheeter store', () => {
  beforeEach(() => {
    useSheeter.setState({ sheets: [] });
    fallbackContentRef.current = null;
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens a sheet with its defaults and returns its id', () => {
    const id = useSheeter.getState().create('content', sheet('a'));

    expect(id).toBe('a');
    expect(useSheeter.getState().get('a')).toMatchObject({
      id: 'a',
      side: 'right',
      content: 'content',
      open: true,
      modal: true,
      closeSheetOnRouteChange: true,
    });
  });

  it('keeps the defaults for options passed as undefined', () => {
    useSheeter.getState().create(null, sheet('a', { modal: undefined }));

    expect(useSheeter.getState().get('a')).toMatchObject({ modal: true, closeSheetOnRouteChange: true });
  });

  it('replace keeps the defaults for options passed as undefined when it opens a new sheet', () => {
    useSheeter.getState().replace(null, sheet('a', { modal: undefined }));

    expect(useSheeter.getState().get('a')).toMatchObject({ modal: true, open: true });
  });

  it('replaces a sheet created with the same id and moves it last', () => {
    useSheeter.getState().create('first', sheet('a'));
    useSheeter.getState().create(null, sheet('b'));
    useSheeter.getState().create('second', sheet('a', { side: 'left' }));

    expect(openIds()).toEqual(['b', 'a']);
    expect(useSheeter.getState().get('a')).toMatchObject({ content: 'second', side: 'left' });
  });

  it('replace merges into an open sheet in place and reopens it', () => {
    useSheeter.getState().create('first', sheet('a', { title: 'A', closeSheetOnRouteChange: false }));
    useSheeter.getState().create(null, sheet('b'));
    useSheeter.getState().update('a', { open: false });

    const id = useSheeter.getState().replace('second', sheet('a', { side: 'left' }));

    expect(id).toBe('a');
    expect(openIds()).toEqual(['a', 'b']);
    expect(useSheeter.getState().get('a')).toMatchObject({ content: 'second', side: 'left', title: 'A', open: true, closeSheetOnRouteChange: false });
  });

  it('replace opens a new sheet when none has the id', () => {
    useSheeter.getState().replace('content', sheet('a'));

    expect(useSheeter.getState().get('a')).toMatchObject({ content: 'content', open: true, closeSheetOnRouteChange: true });
  });

  it('removes every sheet without an id and passes isCleanup to each onClose', () => {
    const onClose = vi.fn();
    useSheeter.getState().create(null, sheet('a', { onClose }));
    useSheeter.getState().create(null, sheet('b', { onClose }));

    useSheeter.getState().remove(undefined, { isCleanup: true });

    expect(openIds()).toEqual([]);
    expect(onClose.mock.calls).toEqual([[true], [true]]);
  });

  it('removes no sheet for an empty id', () => {
    useSheeter.getState().create(null, sheet('a'));
    useSheeter.getState().create(null, sheet('b'));

    useSheeter.getState().remove('');

    expect(openIds()).toEqual(['a', 'b']);
  });

  it('leaves the store untouched when nothing matches', () => {
    useSheeter.getState().create(null, sheet('a', { closeSheetOnRouteChange: false }));
    const before = useSheeter.getState().sheets;

    useSheeter.getState().remove('missing');
    useSheeter.getState().removeOnRouteChange();

    expect(useSheeter.getState().sheets).toBe(before);
  });

  it('blurs a focused link and stashes it as the focus fallback', () => {
    const link = document.body.appendChild(document.createElement('a'));
    link.href = '#';
    link.focus();

    useSheeter.getState().create(null, sheet('a'));

    expect(fallbackContentRef.current).toBe(link);
    expect(document.activeElement).not.toBe(link);
  });

  it('exposes the store as sheeter for non-React callers', () => {
    expect(sheeter).toBe(useSheeter);
  });
});
