// @vitest-environment jsdom
import { createRef } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { type SheetData, useSheeter } from './use-sheeter';

const sheet = (id: string, data: Partial<SheetData> = {}): SheetData => ({
  id,
  side: 'right',
  triggerRef: createRef(),
  ...data,
});

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
    useSheeter
      .getState()
      .create(null, sheet('pinned', { closeSheetOnRouteChange: false, onClose: () => closed.push('pinned') }));

    useSheeter.getState().removeOnRouteChange();

    expect(closed).toEqual(['route']);
    expect(openIds()).toEqual(['pinned']);
  });
});
