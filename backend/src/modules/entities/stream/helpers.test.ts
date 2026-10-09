import { SSEStreamingApi } from 'hono/streaming';
import { describe, expect, it } from 'vitest';
import { keepAlive, WORKER_AWAY_PING } from './helpers';

/** A real SSE stream and what a client reads from it, frame by frame. */
const openStream = () => {
  const { readable, writable } = new TransformStream();
  const stream = new SSEStreamingApi(writable, readable);
  const reader = stream.responseReadable.getReader();
  const decoder = new TextDecoder();
  const nextFrame = async () => decoder.decode((await reader.read()).value);
  return { stream, nextFrame };
};

describe('stream keepalive', () => {
  it('sends a named ping event with a data line: an event EventSource hands to client code', async () => {
    const { stream, nextFrame } = openStream();
    const running = keepAlive(stream, undefined, 5);

    // The first one goes out at once, the next after the interval.
    const frames = [await nextFrame(), await nextFrame()];
    stream.abort();
    await running;

    // EventSource drops a comment (`: ping`) and an event without a data line; an empty data line is dispatched.
    expect(frames).toEqual(['event: ping\ndata: \n\n', 'event: ping\ndata: \n\n']);
  });

  it('stops once the API closed the stream', async () => {
    const { stream, nextFrame } = openStream();
    const running = keepAlive(stream, undefined, 5);
    await nextFrame();

    await stream.close();

    await expect(running).resolves.toBeUndefined();
  });

  it('reads its data anew for every ping, so a client hears a standing fact at the next one and hears when it ends', async () => {
    const { stream, nextFrame } = openStream();
    const facts = ['', WORKER_AWAY_PING, WORKER_AWAY_PING, ''];
    const running = keepAlive(stream, () => facts.shift() ?? '', 5);

    const frames = [await nextFrame(), await nextFrame(), await nextFrame(), await nextFrame()];
    stream.abort();
    await running;

    expect(frames).toEqual([
      'event: ping\ndata: \n\n',
      'event: ping\ndata: worker_away\n\n',
      'event: ping\ndata: worker_away\n\n',
      'event: ping\ndata: \n\n',
    ]);
  });
});
