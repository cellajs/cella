import { describe, expect, it } from 'vitest';
import { createSseParser } from '../runner/sse';
import type { SseEvent } from '../runner/types';

const parse = (chunks: string[]) => {
  const events: SseEvent[] = [];
  const push = createSseParser((event) => events.push(event));
  for (const chunk of chunks) push(chunk);
  return events;
};

describe('createSseParser', () => {
  it('dispatches an event per blank line, whatever the chunking', () => {
    const stream = 'event: change\ndata: {"seq":1}\n\n: keep-alive\n\nevent: change\ndata: {"seq":2}\n\n';
    const expected = [
      { event: 'change', data: '{"seq":1}' },
      { event: 'change', data: '{"seq":2}' },
    ];
    expect(parse([stream])).toEqual(expected);
    expect(parse(stream.split(''))).toEqual(expected);
  });

  it('joins data lines with a newline and defaults the event name', () => {
    expect(parse(['data: a\ndata:b\nid: 7\n\n'])).toEqual([{ event: 'message', data: 'a\nb', id: '7' }]);
  });

  it('reads CRLF and CR line ends, a CRLF split across chunks included', () => {
    expect(parse(['event: x\r', '\ndata: 1\r\n\r\n', 'data: 2\r\r\n'])).toEqual([
      { event: 'x', data: '1' },
      { event: 'message', data: '2' },
    ]);
  });

  it('keeps an unfinished event until its blank line arrives', () => {
    expect(parse(['event: change\ndata: {"seq":1}\n'])).toEqual([]);
  });
});
