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
