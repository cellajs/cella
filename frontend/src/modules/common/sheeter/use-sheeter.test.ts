// @vitest-environment jsdom
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fallbackContentRef } from '~/utils/fallback-content-ref';
import { type SheetData, sheeter, useSheeter } from './use-sheeter';

const sheet = (id: string, data: Partial<SheetData> = {}): SheetData => ({ id, side: 'right', triggerRef: createRef(), ...data });

const openIds = () => sheeter.getState().sheets.map((s) => s.id);

describe('sheeter close order', () => {
  beforeEach(() => sheeter.setState({ sheets: [] }));

  it('removes the sheet from the store before onClose runs', () => {
    let idsDuringClose: string[] | null = null;
    sheeter.getState().create(null, sheet('a', { onClose: () => (idsDuringClose = openIds()) }));

    sheeter.getState().remove('a');

    expect(idsDuringClose).toEqual([]);
  });

  it('keeps a sheet that onClose opens', () => {
    sheeter.getState().create(null, sheet('a', { onClose: () => sheeter.getState().create(null, sheet('b')) }));

    sheeter.getState().remove('a');

    expect(openIds()).toEqual(['b']);
  });

  it('closes only route-bound sheets on a route change', () => {
    const closed: string[] = [];
    sheeter.getState().create(null, sheet('route', { onClose: () => closed.push('route') }));
    sheeter.getState().create(null, sheet('pinned', { closeSheetOnRouteChange: false, onClose: () => closed.push('pinned') }));

    sheeter.getState().removeOnRouteChange();

    expect(closed).toEqual(['route']);
    expect(openIds()).toEqual(['pinned']);
  });

  it('closes a sheet created with an undefined closeSheetOnRouteChange on a route change', () => {
    sheeter.getState().create(null, sheet('a', { closeSheetOnRouteChange: undefined }));

    expect(sheeter.getState().get('a')?.closeSheetOnRouteChange).toBe(true);
    sheeter.getState().removeOnRouteChange();

    expect(openIds()).toEqual([]);
  });
});

describe('sheeter store', () => {
  beforeEach(() => {
    sheeter.setState({ sheets: [] });
    fallbackContentRef.current = null;
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens a sheet with its defaults and returns its id', () => {
    const id = sheeter.getState().create('content', sheet('a'));

    expect(id).toBe('a');
    expect(sheeter.getState().get('a')).toMatchObject({
      id: 'a',
      side: 'right',
      content: 'content',
      open: true,
      modal: true,
      closeSheetOnRouteChange: true,
    });
  });

  it('keeps the defaults for options passed as undefined', () => {
    sheeter.getState().create(null, sheet('a', { modal: undefined }));

    expect(sheeter.getState().get('a')).toMatchObject({ modal: true, closeSheetOnRouteChange: true });
  });

  it('replace keeps the defaults for options passed as undefined when it opens a new sheet', () => {
    sheeter.getState().replace(null, sheet('a', { modal: undefined }));

    expect(sheeter.getState().get('a')).toMatchObject({ modal: true, open: true });
  });

  it('replaces a sheet created with the same id and moves it last', () => {
    sheeter.getState().create('first', sheet('a'));
    sheeter.getState().create(null, sheet('b'));
    sheeter.getState().create('second', sheet('a', { side: 'left' }));

    expect(openIds()).toEqual(['b', 'a']);
    expect(sheeter.getState().get('a')).toMatchObject({ content: 'second', side: 'left' });
  });

  it('replace merges into an open sheet in place and reopens it', () => {
    sheeter.getState().create('first', sheet('a', { title: 'A', closeSheetOnRouteChange: false }));
    sheeter.getState().create(null, sheet('b'));
    sheeter.getState().update('a', { open: false });

    const id = sheeter.getState().replace('second', sheet('a', { side: 'left' }));

    expect(id).toBe('a');
    expect(openIds()).toEqual(['a', 'b']);
    expect(sheeter.getState().get('a')).toMatchObject({ content: 'second', side: 'left', title: 'A', open: true, closeSheetOnRouteChange: false });
  });

  it('replace opens a new sheet when none has the id', () => {
    sheeter.getState().replace('content', sheet('a'));

    expect(sheeter.getState().get('a')).toMatchObject({ content: 'content', open: true, closeSheetOnRouteChange: true });
  });

  it('removes every sheet without an id and passes isCleanup to each onClose', () => {
    const onClose = vi.fn();
    sheeter.getState().create(null, sheet('a', { onClose }));
    sheeter.getState().create(null, sheet('b', { onClose }));

    sheeter.getState().remove(undefined, { isCleanup: true });

    expect(openIds()).toEqual([]);
    expect(onClose.mock.calls).toEqual([[true], [true]]);
  });

  it('removes no sheet for an empty id', () => {
    sheeter.getState().create(null, sheet('a'));
    sheeter.getState().create(null, sheet('b'));

    sheeter.getState().remove('');

    expect(openIds()).toEqual(['a', 'b']);
  });

  it('leaves the store untouched when nothing matches', () => {
    sheeter.getState().create(null, sheet('a', { closeSheetOnRouteChange: false }));
    const before = sheeter.getState().sheets;

    sheeter.getState().remove('missing');
    sheeter.getState().removeOnRouteChange();

    expect(sheeter.getState().sheets).toBe(before);
  });

  it('blurs a focused link and stashes it as the focus fallback', () => {
    const link = document.body.appendChild(document.createElement('a'));
    link.href = '#';
    link.focus();

    sheeter.getState().create(null, sheet('a'));

    expect(fallbackContentRef.current).toBe(link);
    expect(document.activeElement).not.toBe(link);
  });

  it('exposes the store as sheeter for non-React callers', () => {
    expect(sheeter).toBe(useSheeter);
  });
});

describe('keepMounted sheets', () => {
  beforeEach(() => useSheeter.setState({ sheets: [] }));

  const openStates = () => useSheeter.getState().sheets.map((s) => [s.id, s.open]);

  it('closes in place on remove and runs onClose once', () => {
    const onClose = vi.fn();
    useSheeter.getState().create(null, sheet('a', { keepMounted: true, onClose }));

    useSheeter.getState().remove('a');
    useSheeter.getState().remove('a');

    expect(openStates()).toEqual([['a', false]]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes in place when every sheet or the route-bound sheets close', () => {
    useSheeter.getState().create(null, sheet('kept', { keepMounted: true }));
    useSheeter.getState().create(null, sheet('plain'));

    useSheeter.getState().remove();
    expect(openStates()).toEqual([['kept', false]]);

    useSheeter.getState().create(null, sheet('kept', { keepMounted: true }));
    useSheeter.getState().removeOnRouteChange();
    expect(openStates()).toEqual([['kept', false]]);
  });

  it('mounts closed, leaves an existing sheet alone and opens on create', () => {
    useSheeter.getState().mount('first', sheet('a'));
    expect(useSheeter.getState().get('a')).toMatchObject({ content: 'first', open: false, keepMounted: true, modal: true });

    useSheeter.getState().mount('second', sheet('a'));
    expect(useSheeter.getState().get('a')).toMatchObject({ content: 'first' });

    useSheeter.getState().create('third', sheet('a', { keepMounted: true }));
    expect(useSheeter.getState().get('a')).toMatchObject({ content: 'third', open: true });
  });

  it('unmounts a closed sheet without onClose, an open one with a cleanup onClose', () => {
    const onClose = vi.fn();
    useSheeter.getState().mount(null, sheet('closed', { onClose }));
    useSheeter.getState().create(null, sheet('open', { keepMounted: true, onClose }));

    useSheeter.getState().unmount('closed');
    expect(onClose).not.toHaveBeenCalled();

    useSheeter.getState().unmount('open');
    expect(onClose.mock.calls).toEqual([[true]]);
    expect(openIds()).toEqual([]);
  });
});
