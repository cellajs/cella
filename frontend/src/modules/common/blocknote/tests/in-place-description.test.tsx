// @vitest-environment jsdom
import { act, type RefObject, useEffect, useImperativeHandle } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlockNoteContentApi } from '~/modules/common/blocknote/blocknote-editor';
import { DescriptionLayers } from '~/modules/common/blocknote/description-layers';
import { type InPlaceDescription, useInPlaceDescription } from '~/modules/common/blocknote/use-in-place-description';

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
  description?: string | null;
  synced?: boolean;
}

const descriptions: Record<string, InPlaceDescription> = {};
const cardClicks = vi.fn();

/** An app card around the description: it owns `editing` and applies the override to its one static. */
function Card({ id = 'a', editing = false, description = 'stored', synced = true }: CardProps) {
  const inPlace = useInPlaceDescription({ editing, canEdit: true, description });
  descriptions[id] = inPlace;

  return (
    <DescriptionLayers
      inPlace={inPlace}
      data-card={id}
      onClick={() => cardClicks(id)}
      staticView={<FakeStatic value={inPlace.staticOverride ?? description} onReady={inPlace.onStaticReady} />}
      editor={<FakeEditor synced={synced} apiRef={inPlace.apiRef} onEditorReady={inPlace.onEditorReady} />}
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

const warm = (reason: string, id = 'a') => act(() => descriptions[id].warm(reason));
const cool = (reason: string, id = 'a') => act(() => descriptions[id].cool(reason));
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const nextFrame = () => act(() => vi.advanceTimersToNextFrame());
const releaseStatic = () => act(() => staticReady());
const hideTab = () =>
  act(() => {
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });

/** A click as the browser dispatches it, returned so a test can read whether the default was prevented. */
const click = (target: Element) => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};
// The static renders its checkbox disabled, so a click reaches the wrapper.
const clickCheckbox = (id = 'a') => click(card(id).querySelector('.checklist-checkbox-wrapper') as Element);
const clickText = (id = 'a') => click(card(id).querySelector('[data-text]') as Element);

describe('the hand-off', () => {
  it('shows the edited content after editing until the cache has it, then follows the cache, a rollback included', async () => {
    await render({ editing: true });
    editorDocument = 'edited';
    await render({ editing: false });
    await releaseStatic();
    expect(shownText()).toBe('edited');

    // The cache took the content; a rollback after it shows the rolled-back value, not the hand-off.
    await render({ description: 'edited' });
    await render({ description: 'stored' });
    expect(shownText()).toBe('stored');

    // A newer write in place of the content wins over the hand-off, and so does a rollback after it.
    await render({ editing: true });
    editorDocument = 'edited again';
    await render({ editing: false });
    await releaseStatic();
    expect(shownText()).toBe('edited again');
    await render({ description: 'newer' });
    expect(shownText()).toBe('newer');
    await render({ description: 'stored' });
    expect(shownText()).toBe('stored');
  });
});

describe('clicks on the static', () => {
  it('routes a checkbox click to the editor, each once and never to the app, and a text click to the app', async () => {
    await render({ synced: false });

    // Before the editor is ready: the clicks queue and warm the host behind the static, still connecting.
    const event = clickCheckbox();
    clickCheckbox();
    expect(event.defaultPrevented).toBe(true);
    expect(isWarm()).toBe(true);
    expect(api.toggleChecklist).not.toHaveBeenCalled();

    await render({ synced: true });
    // A frame after ready, so a dev StrictMode remount of the editor's view keeps what the flush applies.
    expect(api.toggleChecklist).not.toHaveBeenCalled();
    await nextFrame();
    expect(api.toggleChecklist).toHaveBeenCalledTimes(2);
    expect(api.commit).toHaveBeenCalledOnce();
    expect(shownText()).toBe('stored+box-1+box-1');
    // The toggle's reason is released once it is applied.
    expect(isCold()).toBe(true);

    // A ready editor reported ready once already: the click toggles at once.
    await warm('hover');
    clickCheckbox();
    expect(api.toggleChecklist).toHaveBeenCalledTimes(3);
    expect(api.commit).toHaveBeenCalledTimes(2);
    expect(shownText()).toBe('stored+box-1+box-1+box-1');
    expect(cardClicks).not.toHaveBeenCalled();

    // Text is the app's: its own click handler may start editing.
    expect(clickText().defaultPrevented).toBe(false);
    expect(cardClicks).toHaveBeenCalledOnce();
  });
});

describe('the cursor', () => {
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
    expect(api.focusSummaryEnd).not.toHaveBeenCalled();
    await nextFrame();
    expect(api.focusSummaryEnd).toHaveBeenCalledOnce();
  });
});

describe('safety cooling', () => {
  it('never cools an editing or held editor', async () => {
    await render({ id: 'a', editing: true }, { id: 'b' }, { id: 'c' });
    await warm('hover', 'b');
    await warm('hover', 'c');
    // The editing description is the most recently warmed, yet counts not toward the cap.
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
});
