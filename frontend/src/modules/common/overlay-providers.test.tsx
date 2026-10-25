// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { type DialogData, dialoger } from '~/modules/common/dialoger/use-dialoger';
import { Dropdowner } from '~/modules/common/dropdowner/provider';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { Sheeter } from '~/modules/common/sheeter/provider';
import { navSheetId, type SheetData, sheeter } from '~/modules/common/sheeter/use-sheeter';
import { navigationStore } from '~/modules/navigation/navigation-store';
import { uiStore } from '~/modules/ui/ui-store';

type BeforeLoad = (event: { pathChanged: boolean }) => void;

const router = vi.hoisted(() => ({ listeners: new Set<BeforeLoad>() }));

vi.mock('~/routes/-router-instance', () => ({
  getRouter: () => ({
    subscribe: (event: string, listener: BeforeLoad) => {
      if (event !== 'onBeforeLoad') throw new Error(`unexpected router event ${event}`);
      router.listeners.add(listener);
      return () => router.listeners.delete(listener);
    },
  }),
}));

// The providers are under test here, not the overlay shells they render.
vi.mock('~/modules/common/dialoger/dialog', () => ({ DialogerDialog: () => null }));
vi.mock('~/modules/common/dialoger/drawer', () => ({ DialogerDrawer: () => null }));
vi.mock('~/modules/common/sheeter/sheet', () => ({ SheeterSheet: () => null }));
vi.mock('~/modules/common/sheeter/drawer', () => ({ SheeterDrawer: () => null }));
vi.mock('~/modules/common/dropdowner/dropdown', () => ({ DropdownerDropdown: () => null }));
vi.mock('~/modules/common/dropdowner/drawer', () => ({ DropdownerDrawer: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dialog = (id: string, data: Partial<DialogData> = {}): DialogData => ({ id, triggerRef: createRef(), ...data });
const sheet = (id: string, data: Partial<SheetData> = {}): SheetData => ({ id, side: 'right', triggerRef: createRef(), ...data });

const changeRoute = (pathChanged: boolean) =>
  act(() => {
    for (const listener of router.listeners) listener({ pathChanged });
  });

const dialogIds = () => dialoger.getState().dialogs.map((d) => d.id);
const sheetIds = () => sheeter.getState().sheets.map((s) => s.id);
const locks = () => uiStore.getState().uiLocks;

let root: Root;

beforeEach(async () => {
  dialoger.setState({ dialogs: [] });
  sheeter.setState({ sheets: [] });
  dropdowner.setState({ dropdown: null, lastRemovedTriggerId: null, lastRemovedAt: 0 });
  navigationStore.setState({ navSheetOpen: null, keepNavOpen: false });
  uiStore.setState({ uiLocks: [] });

  root = createRoot(document.createElement('div'));
  await act(async () =>
    root.render(
      <>
        <Dialoger />
        <Sheeter />
        <Dropdowner />
      </>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
});

describe('overlay providers on a route change', () => {
  it('ignore a navigation that keeps the path', async () => {
    await act(() => {
      dialoger.getState().create(null, dialog('d'));
      sheeter.getState().create(null, sheet('s'));
    });

    await changeRoute(false);

    expect(dialogIds()).toEqual(['d']);
    expect(sheetIds()).toEqual(['s']);
  });

  it('dialoger closes every dialog and calls onClose with isCleanup', async () => {
    const onClose = vi.fn();
    await act(() => {
      dialoger.getState().create(null, dialog('a', { onClose }));
      dialoger.getState().create(null, dialog('b', { onClose }));
    });

    await changeRoute(true);

    expect(dialogIds()).toEqual([]);
    expect(onClose.mock.calls).toEqual([[true], [true]]);
  });

  it('sheeter closes route-bound sheets with isCleanup and keeps the others', async () => {
    const onClose = vi.fn();
    await act(() => {
      sheeter.getState().create(null, sheet('route', { onClose }));
      sheeter.getState().create(null, sheet('pinned', { closeSheetOnRouteChange: false, onClose }));
    });

    await changeRoute(true);

    expect(sheetIds()).toEqual(['pinned']);
    expect(onClose.mock.calls).toEqual([[true]]);
  });

  it('sheeter keeps the nav sheet across a route change only while the nav is kept open', async () => {
    const onClose = vi.fn();
    await act(() => {
      navigationStore.setState({ navSheetOpen: 'menu' as never, keepNavOpen: true });
      sheeter.getState().create(null, sheet(navSheetId, { onClose }));
      sheeter.getState().create(null, sheet('other', { onClose }));
    });

    await changeRoute(true);
    expect(sheetIds()).toEqual(['nav-sheet']);

    await act(() => navigationStore.setState({ keepNavOpen: false }));
    await changeRoute(true);
    expect(sheetIds()).toEqual([]);
    expect(onClose.mock.calls).toEqual([[true], [true]]);
  });
});

describe('overlay providers while open', () => {
  it('lock the UI per overlay kind while one is open', async () => {
    const triggerRef = { current: document.body.appendChild(document.createElement('button')) };
    await act(() => {
      dialoger.getState().create(null, dialog('d'));
      sheeter.getState().create(null, sheet('s'));
      dropdowner.getState().create(null, { id: 'dd', triggerId: 'dd', triggerRef });
    });

    expect([...locks()].sort()).toEqual(['dialoger', 'dropdowner', 'sheeter']);

    await act(() => {
      dialoger.getState().remove();
      dropdowner.getState().remove();
    });
    expect(locks()).toEqual(['sheeter']);

    await act(() => sheeter.getState().remove());
    expect(locks()).toEqual([]);
  });
});
