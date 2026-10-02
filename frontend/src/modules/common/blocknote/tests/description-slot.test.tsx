// @vitest-environment jsdom
import { act, type RefObject, useEffect, useImperativeHandle, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlockNoteContentApi } from '~/modules/common/blocknote/blocknote-editor';
import { DescriptionLayers } from '~/modules/common/blocknote/description-layers';
import { type DescriptionSlot, useDescriptionSlot } from '~/modules/common/blocknote/use-description-slot';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A fake editor document: each toggle appends its checkbox id, so the static can show what the editor holds.
let editorDocument = 'stored';
const api = {
  getContent: vi.fn(() => editorDocument),
  focusSummaryEnd: vi.fn(),
  placeCursorAtPoint: vi.fn(),
  toggleChecklist: vi.fn((checkboxId: string) => {
    editorDocument = `${editorDocument}+${checkboxId}`;
    return true;
  }),
  commit: vi.fn(),
} satisfies BlockNoteContentApi;

interface EditorProps {
  apiRef: RefObject<BlockNoteContentApi | null>;
  onEditorReady: () => void;
}

/** The editor once synced: it exposes its api and reports ready once, as BlockNote does. */
function SyncedEditor({ apiRef, onEditorReady }: EditorProps) {
  useImperativeHandle(apiRef, () => api, []);
  useEffect(() => {
    onEditorReady();
  }, []);
  return <div data-editor>{editorDocument}</div>;
}

/** Like the collaborative host: a placeholder until its connection synced, then the editor. */
function FakeEditor({ synced, ...props }: EditorProps & { synced: boolean }) {
  return synced ? <SyncedEditor {...props} /> : <p data-connecting>connecting</p>;
}

/** The static's `onReady` of the latest render, which a test fires to say the static is painted. */
let staticReady: () => void = () => {};

function FakeStatic({ value, onReady }: { value: string | null; onReady: () => void }) {
  staticReady = onReady;
  return (
    <div data-static>
      <span data-text>{value}</span>
      <div className="checklist-checkbox-wrapper">
        <input type="checkbox" className="checklist-checkbox" data-checkbox-id="box-1" disabled />
      </div>
    </div>
  );
}

interface CardProps {
  id?: string;
  editing?: boolean;
  canEdit?: boolean;
  description?: string | null;
  holdOnExit?: boolean;
  cursorAtPoint?: boolean;
  synced?: boolean;
  /** The card starts editing on a click that reaches it, as raak's card does. */
  editOnClick?: boolean;
}

const slots: Record<string, DescriptionSlot> = {};
const cardClicks = vi.fn();

/** An app card around the slot: it owns `editing` and applies the override to its one static. */
function Card({
  id = 'a',
  editing = false,
  canEdit = true,
  description = 'stored',
  holdOnExit,
  cursorAtPoint,
  synced = true,
  editOnClick,
}: CardProps) {
  const [clickedToEdit, setClickedToEdit] = useState(false);
  const slot = useDescriptionSlot({ editing: editing || clickedToEdit, canEdit, description, holdOnExit, cursorAtPoint });
  slots[id] = slot;

  const onClick = () => {
    cardClicks(id);
    if (editOnClick) setClickedToEdit(true);
  };

  return (
    <DescriptionLayers
      slot={slot}
      data-card={id}
      onClick={onClick}
      staticView={<FakeStatic value={slot.staticOverride ?? description} onReady={slot.onStaticReady} />}
      editor={<FakeEditor synced={synced} apiRef={slot.apiRef} onEditorReady={slot.onEditorReady} />}
    />
  );
}

let root: Root;
let container: HTMLDivElement;
let hidden = false;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  editorDocument = 'stored';
  hidden = false;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const render = (...cards: CardProps[]) => act(() => root.render(cards.map((props) => <Card key={props.id ?? 'a'} {...props} />)));

const card = (id = 'a') => container.querySelector(`[data-card="${id}"]`) as HTMLElement;
const staticLayer = (id = 'a') => card(id).querySelector('[data-static]')?.parentElement ?? null;
const editorLayer = (id = 'a') => card(id).querySelector('[data-editor], [data-connecting]')?.parentElement ?? null;
const shownText = (id = 'a') => card(id).querySelector('[data-text]')?.textContent;
const invisible = (layer: Element | null) => layer?.classList.contains('invisible') ?? false;

/** No editor; the static in the layout. */
const isCold = (id = 'a') => editorLayer(id) === null && staticLayer(id) !== null && !invisible(staticLayer(id));
/** The editor behind the static, invisible and out of the layout. */
const isWarm = (id = 'a') => invisible(editorLayer(id)) && !invisible(staticLayer(id));
/** The outgoing editor in the layout, the static rendering invisibly under it. */
const isHolding = (id = 'a') => editorLayer(id) !== null && !invisible(editorLayer(id)) && invisible(staticLayer(id));
/** The editor alone, in the layout. */
const isEditing = (id = 'a') => staticLayer(id) === null && editorLayer(id) !== null && !invisible(editorLayer(id));

const warm = (reason: string, id = 'a') => act(() => slots[id].warm(reason));
const cool = (reason: string, id = 'a') => act(() => slots[id].cool(reason));
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const nextFrame = () => act(() => vi.advanceTimersToNextFrame());
const releaseStatic = () => act(() => staticReady());
const hideTab = () =>
  act(() => {
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });

/** A click as the browser dispatches it, returned so a test can read whether the default was prevented. */
const click = (target: Element, init: MouseEventInit = {}) => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};
// The static renders its checkbox disabled, so a click reaches the wrapper.
const clickCheckbox = (id = 'a') => click(card(id).querySelector('.checklist-checkbox-wrapper') as Element);
const clickText = (id = 'a', init: MouseEventInit = {}) => click(card(id).querySelector('[data-text]') as Element, init);

describe('useDescriptionSlot transitions', () => {
  it('shows the static alone while cold and the editor alone while editing', async () => {
    await render({});
    expect(isCold()).toBe(true);
    expect(shownText()).toBe('stored');

    await render({ editing: true });
    expect(isEditing()).toBe(true);
  });

  it('holds the editor in the layout on leaving editing until the static is ready, then shows its content', async () => {
    await render({ editing: true });
    editorDocument = 'edited';

    await render({ editing: false });
    expect(isHolding()).toBe(true);
    expect(shownText()).toBe('edited');

    await releaseStatic();
    expect(isCold()).toBe(true);
    expect(shownText()).toBe('edited');
  });

  it('releases the hold after 250 ms when the static never reports ready', async () => {
    await render({ editing: true });
    await render({ editing: false });

    await advance(249);
    expect(isHolding()).toBe(true);
    await advance(1);
    expect(isCold()).toBe(true);
  });

  it('hands off without a hold where the app says so, showing the cache', async () => {
    await render({ editing: true });
    editorDocument = 'edited';

    await render({ editing: false, holdOnExit: false });
    expect(isCold()).toBe(true);
    expect(shownText()).toBe('stored');
    expect(slots.a.staticOverride).toBeUndefined();
  });

  it('keeps a warm editor warm through editing and back', async () => {
    await render({});
    await warm('hover');
    expect(isWarm()).toBe(true);

    await render({ editing: true });
    await render({ editing: false, holdOnExit: false });
    expect(isWarm()).toBe(true);
  });
});

describe('the hand-off override', () => {
  const handOff = async () => {
    await render({ editing: true });
    editorDocument = 'edited';
    await render({ editing: false });
    await releaseStatic();
    expect(shownText()).toBe('edited');
  };

  it('sets none when the editor holds the description already', async () => {
    await render({ editing: true });
    await render({ editing: false });

    expect(slots.a.staticOverride).toBeUndefined();
  });

  it('drops once the description has the content, and stays dropped', async () => {
    await handOff();

    await render({ description: 'edited' });
    expect(slots.a.staticOverride).toBeUndefined();

    // A rollback shows the rolled-back value, not the hand-off.
    await render({ description: 'stored' });
    expect(shownText()).toBe('stored');
  });

  it('drops once the description moves past the value it replaced', async () => {
    await handOff();

    await render({ description: 'newer' });
    expect(shownText()).toBe('newer');

    await render({ description: 'stored' });
    expect(shownText()).toBe('stored');
  });

  it('drops when editing starts again', async () => {
    await handOff();

    await render({ editing: true });
    expect(slots.a.staticOverride).toBeUndefined();
  });
});

describe('checklist toggles on the static', () => {
  it('queues a toggle until the editor is ready, then commits it and shows it', async () => {
    await render({ synced: false });

    const event = clickCheckbox();
    expect(event.defaultPrevented).toBe(true);
    expect(cardClicks).not.toHaveBeenCalled();
    // Warmed for the toggle: the host behind the static, still connecting.
    expect(isWarm()).toBe(true);
    expect(api.toggleChecklist).not.toHaveBeenCalled();

    await render({ synced: true });
    expect(api.toggleChecklist).toHaveBeenCalledExactlyOnceWith('box-1');
    expect(api.commit).toHaveBeenCalledOnce();
    expect(shownText()).toBe('stored+box-1');
    // The toggle's reason is released once it is applied.
    expect(isCold()).toBe(true);
  });

  it('toggles at once through a ready warm editor, which stays warm', async () => {
    await render({});
    await warm('hover');

    clickCheckbox();
    expect(api.toggleChecklist).toHaveBeenCalledExactlyOnceWith('box-1');
    expect(api.commit).toHaveBeenCalledOnce();
    expect(shownText()).toBe('stored+box-1');
    expect(isWarm()).toBe(true);
  });

  it('applies every toggle queued before the editor is ready', async () => {
    await render({ synced: false });
    clickCheckbox();
    clickCheckbox();

    await render({ synced: true });
    expect(api.toggleChecklist).toHaveBeenCalledTimes(2);
    expect(api.commit).toHaveBeenCalledOnce();
    expect(shownText()).toBe('stored+box-1+box-1');
  });

  it('leaves a text click to the app', async () => {
    await render({});

    const event = clickText();
    expect(event.defaultPrevented).toBe(false);
    expect(cardClicks).toHaveBeenCalledOnce();
    expect(isCold()).toBe(true);
  });

  it('takes no toggle without edit rights', async () => {
    await render({ canEdit: false });

    clickCheckbox();
    expect(cardClicks).toHaveBeenCalledOnce();
    expect(isCold()).toBe(true);
    expect(api.toggleChecklist).not.toHaveBeenCalled();
  });
});

describe('the cursor', () => {
  it('goes to the point of the text click that starts editing, where the layout matches', async () => {
    await render({ cursorAtPoint: true, editOnClick: true });
    await warm('hover');

    clickText('a', { clientX: 12, clientY: 34 });
    expect(isEditing()).toBe(true);
    await nextFrame();

    expect(api.placeCursorAtPoint).toHaveBeenCalledExactlyOnceWith(12, 34);
    expect(api.focusSummaryEnd).not.toHaveBeenCalled();
  });

  it('goes to the end where the layout does not match', async () => {
    await render({ editOnClick: true });
    await warm('hover');

    clickText('a', { clientX: 12, clientY: 34 });
    await nextFrame();

    expect(api.focusSummaryEnd).toHaveBeenCalledOnce();
    expect(api.placeCursorAtPoint).not.toHaveBeenCalled();
  });

  it('goes to the end when editing starts without a click, and forgets a click no editing took', async () => {
    await render({ cursorAtPoint: true });
    await warm('hover');
    clickText('a', { clientX: 12, clientY: 34 });
    await advance(0);

    await render({ cursorAtPoint: true, editing: true });
    await nextFrame();

    expect(api.focusSummaryEnd).toHaveBeenCalledOnce();
    expect(api.placeCursorAtPoint).not.toHaveBeenCalled();
  });

  it('waits for a cold editor to be ready, and never moves the cursor of a warm one', async () => {
    await render({ synced: false });
    await warm('hover');
    await render({ synced: true });
    expect(api.focusSummaryEnd).not.toHaveBeenCalled();

    await cool('hover');
    await render({ synced: false, editing: true });
    await nextFrame();
    expect(api.focusSummaryEnd).not.toHaveBeenCalled();

    await render({ synced: true, editing: true });
    expect(api.focusSummaryEnd).toHaveBeenCalledOnce();
  });
});

describe('warm reasons', () => {
  it('keep the editor warm while any reason holds', async () => {
    await render({});

    await warm('hover');
    await warm('menu');
    await cool('hover');
    expect(isWarm()).toBe(true);

    await cool('menu');
    expect(isCold()).toBe(true);
  });

  it('count a reason once, however often it is warmed', async () => {
    await render({});

    await warm('hover');
    await warm('hover');
    await cool('hover');
    expect(isCold()).toBe(true);
  });
});

describe('safety cooling', () => {
  it('refuses to warm without edit rights, and cools when they go', async () => {
    await render({ canEdit: false });
    await warm('hover');
    expect(isCold()).toBe(true);

    await render({});
    await warm('hover');
    expect(isWarm()).toBe(true);

    await render({ canEdit: false });
    expect(isCold()).toBe(true);
    await render({});
    expect(isCold()).toBe(true);
  });

  it('cools every reason when the tab is hidden', async () => {
    await render({});
    await warm('hover');
    await warm('menu');

    await hideTab();
    expect(isCold()).toBe(true);
  });

  it('cools a reason not renewed within 30 s', async () => {
    await render({});
    await warm('hover');
    await warm('menu');

    await advance(20_000);
    await warm('menu');
    await advance(10_000);
    // The renewed menu reason holds; the hover expired, so releasing the menu cools.
    expect(isWarm()).toBe(true);
    await cool('menu');
    expect(isCold()).toBe(true);

    await warm('menu');
    await advance(29_999);
    expect(isWarm()).toBe(true);
    await advance(1);
    expect(isCold()).toBe(true);
  });

  it('keeps at most two warm editors per tab, cooling the least recently warmed', async () => {
    await render({ id: 'a' }, { id: 'b' }, { id: 'c' });

    await warm('hover', 'a');
    await warm('hover', 'b');
    await warm('hover', 'c');
    expect([isCold('a'), isWarm('b'), isWarm('c')]).toEqual([true, true, true]);

    await warm('hover', 'b');
    await warm('hover', 'a');
    expect([isWarm('a'), isWarm('b'), isCold('c')]).toEqual([true, true, true]);
  });

  it('never cools an editing or held editor', async () => {
    await render({ id: 'a', editing: true }, { id: 'b' }, { id: 'c' });
    await warm('hover', 'b');
    await warm('hover', 'c');
    // The editing slot is the most recently warmed, yet counts not toward the cap.
    await warm('hover', 'a');
    expect([isEditing('a'), isWarm('b'), isWarm('c')]).toEqual([true, true, true]);

    await hideTab();
    expect(isEditing('a')).toBe(true);
    await advance(30_000);
    expect(isEditing('a')).toBe(true);

    await render({ id: 'a' }, { id: 'b' }, { id: 'c' });
    await hideTab();
    expect(isHolding('a')).toBe(true);
  });

  it('keeps a queued toggle through a hidden tab, and drops it once idle', async () => {
    await render({ synced: false });
    clickCheckbox();

    await hideTab();
    expect(isWarm()).toBe(true);

    await advance(30_000);
    expect(isCold()).toBe(true);
    await warm('hover');
    await render({ synced: true });
    expect(api.toggleChecklist).not.toHaveBeenCalled();
  });
});
