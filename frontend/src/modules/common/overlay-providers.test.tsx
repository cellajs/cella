// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { type DialogData, useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { Dropdowner } from '~/modules/common/dropdowner/provider';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { Sheeter } from '~/modules/common/sheeter/provider';
import { type SheetData, useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { useUIStore } from '~/modules/ui/ui-store';

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
const sheet = (id: string, data: Partial<SheetData> = {}): SheetData => ({
  id,
  side: 'right',
  triggerRef: createRef(),
  ...data,
});

const changeRoute = (pathChanged: boolean) =>
  act(() => {
    for (const listener of router.listeners) listener({ pathChanged });
  });

const dialogIds = () => useDialoger.getState().dialogs.map((d) => d.id);
const sheetIds = () => useSheeter.getState().sheets.map((s) => s.id);
const locks = () => useUIStore.getState().uiLocks;

let root: Root;

beforeEach(async () => {
  useDialoger.setState({ dialogs: [] });
  useSheeter.setState({ sheets: [] });
  useDropdowner.setState({ dropdown: null, lastRemovedTriggerId: null, lastRemovedAt: 0 });
  useNavigationStore.setState({ navSheetOpen: null, keepNavOpen: false });
  useUIStore.setState({ uiLocks: [] });

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
  it('subscribe once each for the dialoger and sheeter and unsubscribe on unmount', async () => {
    expect(router.listeners.size).toBe(2);

    await act(async () => root.unmount());

    expect(router.listeners.size).toBe(0);
    root = createRoot(document.createElement('div'));
  });

  it('ignore a navigation that keeps the path', async () => {
    await act(() => {
      useDialoger.getState().create(null, dialog('d'));
      useSheeter.getState().create(null, sheet('s'));
    });

    await changeRoute(false);

    expect(dialogIds()).toEqual(['d']);
    expect(sheetIds()).toEqual(['s']);
  });

  it('dialoger closes every dialog and calls onClose with isCleanup', async () => {
    const onClose = vi.fn();
    await act(() => {
      useDialoger.getState().create(null, dialog('a', { onClose }));
      useDialoger.getState().create(null, dialog('b', { onClose }));
    });

    await changeRoute(true);

    expect(dialogIds()).toEqual([]);
    expect(onClose.mock.calls).toEqual([[true], [true]]);
  });

  it('sheeter closes route-bound sheets with isCleanup and keeps the others', async () => {
    const onClose = vi.fn();
    await act(() => {
      useSheeter.getState().create(null, sheet('route', { onClose }));
      useSheeter.getState().create(null, sheet('pinned', { closeSheetOnRouteChange: false, onClose }));
    });

    await changeRoute(true);

    expect(sheetIds()).toEqual(['pinned']);
    expect(onClose.mock.calls).toEqual([[true]]);
  });

  it('sheeter keeps the nav sheet while the nav is kept open', async () => {
    const onClose = vi.fn();
    await act(() => {
      useNavigationStore.setState({ navSheetOpen: 'menu' as never, keepNavOpen: true });
      useSheeter.getState().create(null, sheet('nav-sheet', { onClose }));
      useSheeter.getState().create(null, sheet('other', { onClose }));
    });

    await changeRoute(true);

    expect(sheetIds()).toEqual(['nav-sheet']);
    expect(onClose.mock.calls).toEqual([[true]]);
  });

  it('sheeter closes the nav sheet when the nav is not kept open', async () => {
    const onClose = vi.fn();
    await act(() => {
      useNavigationStore.setState({ navSheetOpen: 'menu' as never, keepNavOpen: false });
      useSheeter.getState().create(null, sheet('nav-sheet', { onClose }));
    });

    await changeRoute(true);

    expect(sheetIds()).toEqual([]);
    expect(onClose.mock.calls).toEqual([[true]]);
  });

  it('dropdowner keeps its dropdown', async () => {
    const triggerRef = { current: document.body.appendChild(document.createElement('button')) };
    await act(() => {
      useDropdowner.getState().create(null, { id: 'dd', triggerId: 'dd', triggerRef });
    });

    await changeRoute(true);

    expect(useDropdowner.getState().dropdown?.id).toBe('dd');
  });
});

describe('overlay providers while open', () => {
  it('lock the UI per overlay kind while one is open', async () => {
    const triggerRef = { current: document.body.appendChild(document.createElement('button')) };
    await act(() => {
      useDialoger.getState().create(null, dialog('d'));
      useSheeter.getState().create(null, sheet('s'));
      useDropdowner.getState().create(null, { id: 'dd', triggerId: 'dd', triggerRef });
    });

    expect([...locks()].sort()).toEqual(['dialoger', 'dropdowner', 'sheeter']);

    await act(() => {
      useDialoger.getState().remove();
      useDropdowner.getState().remove();
    });
    expect(locks()).toEqual(['sheeter']);

    await act(() => useSheeter.getState().remove());
    expect(locks()).toEqual([]);
  });

  it('mark the body with sheeter-open while a sheet is open', async () => {
    expect(document.body.classList.contains('sheeter-open')).toBe(false);

    await act(() => {
      useSheeter.getState().create(null, sheet('s'));
    });
    expect(document.body.classList.contains('sheeter-open')).toBe(true);

    await act(() => useSheeter.getState().remove('s'));
    expect(document.body.classList.contains('sheeter-open')).toBe(false);
  });

  it('drop sheeter-open when the provider unmounts with a sheet open', async () => {
    await act(() => {
      useSheeter.getState().create(null, sheet('s'));
    });

    await act(async () => root.unmount());

    expect(document.body.classList.contains('sheeter-open')).toBe(false);
    expect(locks()).toEqual([]);
    root = createRoot(document.createElement('div'));
  });
});
