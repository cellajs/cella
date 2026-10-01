// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { Sheeter } from '~/modules/common/sheeter/provider';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { useUIStore } from '~/modules/ui/ui-store';

vi.mock('~/routes/-router-instance', () => ({ getRouter: () => ({ subscribe: () => () => {} }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  useDialoger.setState({ dialogs: [] });
  useSheeter.setState({ sheets: [] });
  useUIStore.setState({ uiLocks: [] });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <>
        <Dialoger />
        <Sheeter />
      </>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(Element.prototype, 'getAnimations');
});

/** Presses Escape inside the open popup, the way Base UI's dismiss handling expects it. */
async function pressEscape() {
  const popup = document.querySelector('[role="dialog"]') as HTMLElement;
  await act(async () => {
    popup.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  // Base UI reports the close once exit animations finish (none run in jsdom).
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
}

/** Holds Base UI exits until the returned function runs: jsdom has no getAnimations, so an exit otherwise ends at once. */
function holdExits() {
  let finish = () => {};
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let held = true;
  Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => (held ? [{ finished }] : []) });

  return async () => {
    held = false;
    finish();
    // Base UI checks animations on the next frame
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
  };
}

/** Opens a sheet with a focusable button inside, returning focus to `trigger` on close. */
async function openSheetWithButton(trigger: HTMLElement) {
  await act(async () => {
    useSheeter
      .getState()
      .create(<button type="button">Inside</button>, { id: 'sheet', side: 'left', triggerRef: { current: trigger }, title: 'Sheet' });
  });
  (document.querySelector('[role="dialog"] button') as HTMLElement).focus();
}

describe('overlay exit', () => {
  it('runs a dismissed sheet onClose once, then removes it after its exit', async () => {
    const onClose = vi.fn();
    await act(async () => {
      useSheeter.getState().create(<p>Sheet body</p>, { id: 'sheet', side: 'right', triggerRef: createRef(), title: 'Sheet', onClose });
    });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    await pressEscape();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useSheeter.getState().sheets).toEqual([]);
    expect(useUIStore.getState().uiLocks).not.toContain('sheeter');
  });

  it('keeps a sheet closed through the store, so it can be reopened in place', async () => {
    const onClose = vi.fn();
    await act(async () => {
      useSheeter.getState().create(<p>Nav</p>, { id: 'nav-sheet', side: 'left', triggerRef: createRef(), title: 'Menu', onClose });
    });

    await act(async () => useSheeter.getState().update('nav-sheet', { open: false }));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(useSheeter.getState().sheets.map((s) => [s.id, s.open])).toEqual([['nav-sheet', false]]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    ['a store remove', () => useSheeter.getState().remove('sheet')],
    ['a route change', () => useSheeter.getState().removeOnRouteChange({ isCleanup: true })],
  ])('keeps a sheet closed by %s rendered until its exit ends, without holding the UI lock', async (_, close) => {
    const onClose = vi.fn();
    await act(async () => {
      useSheeter.getState().create(<p>Sheet body</p>, { id: 'sheet', side: 'left', triggerRef: createRef(), title: 'Sheet', onClose });
    });
    const sheet = document.querySelector('[role="dialog"]') as HTMLElement;
    const endExit = holdExits();

    await act(async () => close());

    expect(useSheeter.getState().sheets).toEqual([]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useUIStore.getState().uiLocks).not.toContain('sheeter');
    expect(document.body.classList.contains('sheeter-open')).toBe(false);
    expect(sheet.isConnected).toBe(true);
    expect(sheet.hasAttribute('data-closed')).toBe(true);

    await endExit();
    expect(sheet.isConnected).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reopens a sheet created again with the same id while it slides out', async () => {
    const create = () => useSheeter.getState().create(<p>Sheet body</p>, { id: 'sheet', side: 'left', triggerRef: createRef(), title: 'Sheet' });
    await act(async () => create());
    const endExit = holdExits();

    await act(async () => useSheeter.getState().remove('sheet'));
    await act(async () => create());
    await endExit();

    const sheets = document.querySelectorAll('[role="dialog"]');
    expect(sheets).toHaveLength(1);
    expect(sheets[0].hasAttribute('data-open')).toBe(true);
  });

  it('leaves focus where it moved while the sheet slid out', async () => {
    const trigger = document.createElement('button');
    const target = document.createElement('button');
    document.body.append(trigger, target);
    await openSheetWithButton(trigger);
    const endExit = holdExits();

    await act(async () => useSheeter.getState().remove('sheet'));
    target.focus();
    await endExit();

    expect(document.activeElement).toBe(target);
    trigger.remove();
    target.remove();
  });

  it('returns focus to the trigger when a sheet is dismissed from inside', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    await openSheetWithButton(trigger);

    await pressEscape();

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('removes a dismissed dialog after its exit and then runs onClose once', async () => {
    const onClose = vi.fn();
    await act(async () => {
      useDialoger.getState().create(<p>Dialog body</p>, { id: 'dialog', triggerRef: createRef(), title: 'Dialog', onClose });
    });

    await pressEscape();

    expect(useDialoger.getState().dialogs).toEqual([]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useUIStore.getState().uiLocks).not.toContain('dialoger');
  });
});
