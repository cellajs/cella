// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { Sheeter } from '~/modules/common/sheeter/provider';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { uiStore } from '~/modules/ui/ui-store';

vi.mock('~/routes/-router-instance', () => ({ getRouter: () => ({ subscribe: () => () => {} }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  dialoger.setState({ dialogs: [] });
  sheeter.setState({ sheets: [] });
  uiStore.setState({ uiLocks: [] });
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
    sheeter.getState().create(<button type="button">Inside</button>, { id: 'sheet', side: 'left', triggerRef: { current: trigger }, title: 'Sheet' });
  });
  (document.querySelector('[role="dialog"] button') as HTMLElement).focus();
}

describe('overlay exit', () => {
  it.each([
    ['a store remove', () => sheeter.getState().remove('sheet')],
    ['a route change', () => sheeter.getState().removeOnRouteChange({ isCleanup: true })],
  ])('keeps a sheet closed by %s rendered until its exit ends, without holding the UI lock', async (_, close) => {
    const onClose = vi.fn();
    await act(async () => {
      sheeter.getState().create(<p>Sheet body</p>, { id: 'sheet', side: 'left', triggerRef: createRef(), title: 'Sheet', onClose });
    });
    const sheet = document.querySelector('[role="dialog"]') as HTMLElement;
    const endExit = holdExits();

    await act(async () => close());

    expect(sheeter.getState().sheets).toEqual([]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(uiStore.getState().uiLocks).not.toContain('sheeter');
    expect(document.body.classList.contains('sheeter-open')).toBe(false);
    expect(sheet.isConnected).toBe(true);
    expect(sheet.hasAttribute('data-closed')).toBe(true);

    await endExit();
    expect(sheet.isConnected).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('returns focus to the trigger on close, unless focus left the sheet while it slid out', async () => {
    const trigger = document.createElement('button');
    const target = document.createElement('button');
    document.body.append(trigger, target);

    await openSheetWithButton(trigger);
    await pressEscape();
    expect(document.activeElement).toBe(trigger);

    await openSheetWithButton(trigger);
    const endExit = holdExits();
    await act(async () => sheeter.getState().remove('sheet'));
    target.focus();
    await endExit();
    expect(document.activeElement).toBe(target);

    trigger.remove();
    target.remove();
  });

  it('runs onClose of a dismissed dialog as the close starts and removes the dialog after its exit', async () => {
    const onClose = vi.fn();
    await act(async () => {
      dialoger.getState().create(<p>Dialog body</p>, { id: 'dialog', triggerRef: createRef(), title: 'Dialog', onClose });
    });
    const endExit = holdExits();

    await pressEscape();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialoger.getState().dialogs).toHaveLength(1);

    await endExit();
    expect(dialoger.getState().dialogs).toEqual([]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(uiStore.getState().uiLocks).not.toContain('dialoger');
  });
});

describe('keepMounted sheet', () => {
  const kept = { id: 'kept', side: 'left', triggerRef: createRef<HTMLElement>(), title: 'Kept', keepMounted: true } as const;
  const popup = () => document.querySelector('[role="dialog"]') as HTMLElement | null;

  it('finishes sliding out when unmounted mid-exit, then leaves the DOM', async () => {
    await act(async () => sheeter.getState().create(<p>Kept body</p>, kept));
    const node = popup();
    const endExit = holdExits();

    await act(async () => sheeter.getState().remove('kept'));
    await act(async () => sheeter.getState().unmount('kept'));
    expect(node?.isConnected).toBe(true);
    expect(node?.hasAttribute('data-closed')).toBe(true);

    await endExit();
    expect(node?.isConnected).toBe(false);
  });
});
