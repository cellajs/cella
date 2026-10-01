import { describe, expect, it } from 'vitest';
import { SERVICES } from '../preflight';

describe('bench preflight', () => {
  it('checks only the services the scenarios use', () => {
    expect(SERVICES).toHaveProperty('backend');
    expect(Object.keys(SERVICES).filter((name) => !['backend', 'cdc'].includes(name))).toEqual([]);
  });
});
