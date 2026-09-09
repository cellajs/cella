import { describe, expect, it } from 'vitest';
import { createSerialQueue } from '../lib/serial-queue';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('createSerialQueue', () => {
  it('runs tasks one at a time in enqueue order, even when enqueued without awaiting', async () => {
    const queue = createSerialQueue();
    const order: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const task = (name: string, delayMs: number) => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      order.push(name);
      running--;
    };

    const done = Promise.all([queue.enqueue(task('a', 15)), queue.enqueue(task('b', 1)), queue.enqueue(task('c', 5))]);
    expect(queue.size).toBe(3);
    await done;

    expect(order).toEqual(['a', 'b', 'c']);
    expect(maxRunning).toBe(1);
    expect(queue.size).toBe(0);
  });

  it('a failing task reports the error and does not block the next task', async () => {
    const errors: unknown[] = [];
    const queue = createSerialQueue((err) => errors.push(err));
    const ran: string[] = [];

    await Promise.all([
      queue.enqueue(() => {
        throw new Error('boom');
      }),
      queue.enqueue(() => {
        ran.push('after');
      }),
    ]);

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('boom');
    expect(ran).toEqual(['after']);
  });

  it('close drops tasks that have not started and lets the running one finish', async () => {
    const queue = createSerialQueue();
    const ran: string[] = [];
    let finish!: () => void;
    const first = queue.enqueue(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      ran.push('first');
    });
    const second = queue.enqueue(() => {
      ran.push('second');
    });
    await tick();

    queue.close();
    finish();
    await Promise.all([first, second]);

    expect(ran).toEqual(['first']);
    expect(queue.closed).toBe(true);
    await queue.enqueue(() => {
      ran.push('late');
    });
    expect(ran).toEqual(['first']);
  });
});
