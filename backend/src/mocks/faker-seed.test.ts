import { faker } from '@faker-js/faker';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withFakerSeed } from './faker-seed';

describe('withFakerSeed', () => {
  afterEach(() => vi.restoreAllMocks());

  it('gives the same data for the same key, also for what the generator draws after a nested call', () => {
    const generate = () =>
      withFakerSeed('user:1', () => ({ creator: withFakerSeed('user:1:creator', () => faker.person.fullName()), id: faker.string.uuid() }));
    expect(generate()).toEqual(generate());
  });

  it('leaves the generator on a seed wider than the 32 bits a bare reseed draws, so an id drawn next does not repeat at seed volume', () => {
    // A bare `faker.seed()` takes its seed from one `Math.random()` draw and keeps 32 bits of it.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    withFakerSeed('user:1', () => faker.person.fullName());
    const first = faker.string.uuid();
    withFakerSeed('user:2', () => faker.person.fullName());
    const second = faker.string.uuid();

    expect(second).not.toBe(first);
  });
});
