// @vitest-environment jsdom
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type SheetData, sheeter } from './use-sheeter';

const sheet = (id: string, data: Partial<SheetData> = {}): SheetData => ({ id, side: 'right', triggerRef: createRef(), ...data });

const openIds = () => sheeter.getState().sheets.map((s) => s.id);

describe('sheeter store', () => {
  beforeEach(() => sheeter.setState({ sheets: [] }));

  it('runs onClose after the store dropped the sheet, so a sheet that onClose opens stays', () => {
    let idsDuringClose: string[] | null = null;
    sheeter.getState().create(
      null,
      sheet('a', {
        onClose: () => {
          idsDuringClose = openIds();
          sheeter.getState().create(null, sheet('b'));
        },
      }),
    );

    sheeter.getState().remove('a');

    expect(idsDuringClose).toEqual([]);
    expect(openIds()).toEqual(['b']);
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

  it('closes a keepMounted sheet in place on remove and runs onClose once', () => {
    const onClose = vi.fn();
    sheeter.getState().create(null, sheet('a', { keepMounted: true, onClose }));

    sheeter.getState().remove('a');
    sheeter.getState().remove('a');

    expect(sheeter.getState().sheets.map((s) => [s.id, s.open])).toEqual([['a', false]]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
