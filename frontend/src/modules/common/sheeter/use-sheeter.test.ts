// @vitest-environment jsdom
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type SheetData, useSheeter } from './use-sheeter';

const sheet = (id: string, data: Partial<SheetData> = {}): SheetData => ({ id, side: 'right', triggerRef: createRef(), ...data });

const openIds = () => useSheeter.getState().sheets.map((s) => s.id);

describe('sheeter store', () => {
  beforeEach(() => useSheeter.setState({ sheets: [] }));

  it('runs onClose after the store dropped the sheet, so a sheet that onClose opens stays', () => {
    let idsDuringClose: string[] | null = null;
    useSheeter.getState().create(
      null,
      sheet('a', {
        onClose: () => {
          idsDuringClose = openIds();
          useSheeter.getState().create(null, sheet('b'));
        },
      }),
    );

    useSheeter.getState().remove('a');

    expect(idsDuringClose).toEqual([]);
    expect(openIds()).toEqual(['b']);
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

  it('closes a keepMounted sheet in place on remove and runs onClose once', () => {
    const onClose = vi.fn();
    useSheeter.getState().create(null, sheet('a', { keepMounted: true, onClose }));

    useSheeter.getState().remove('a');
    useSheeter.getState().remove('a');

    expect(useSheeter.getState().sheets.map((s) => [s.id, s.open])).toEqual([['a', false]]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
