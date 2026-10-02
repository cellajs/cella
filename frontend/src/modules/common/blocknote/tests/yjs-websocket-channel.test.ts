import { describe, expect, it } from 'vitest';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

/** A socket that never opens: two providers below can reach each other only through y-websocket's tab channel. */
class ClosedSocket {
  static readonly OPEN = 1;
  readonly OPEN = 1;
  readyState = 0;
  binaryType = 'arraybuffer';
  onmessage = null;
  onopen = null;
  onclose = null;
  onerror = null;
  send() {}
  close() {}
}

/** Two tabs on one document, each with its own provider, as yjs-connections opens them: the text an edit in the first leaves in the second. */
function textInOtherTab(room: string, disableBc: boolean) {
  const docs = [new Y.Doc(), new Y.Doc()];
  const providers = docs.map(
    (doc) => new WebsocketProvider('ws://relay.invalid', room, doc, { disableBc, WebSocketPolyfill: ClosedSocket as unknown as typeof WebSocket }),
  );
  docs[0].getText('t').insert(0, 'typed in tab one');
  const text = docs[1].getText('t').toString();
  for (const provider of providers) provider.destroy();
  for (const doc of docs) doc.destroy();
  return text;
}

/**
 * y-websocket's own tab channel exchanges whole documents between tabs with no generation, so a tab on a reseeded
 * document and one still on the dropped one would merge two histories. yjs-connections turns it off (`disableBc`).
 */
describe("y-websocket's tab channel", () => {
  it('must not carry an edit to another tab with disableBc set', () => {
    expect(textInOtherTab('room-off', true)).toBe('');
  });

  it('carries it without disableBc (positive control)', () => {
    expect(textInOtherTab('room-on', false)).toBe('typed in tab one');
  });
});
