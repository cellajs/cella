import { describe, expect, it } from 'vitest';
import { buildStx } from '#/core/stx/build-stx';

// Covers server-side STX metadata construction for creates and updates.
describe('buildStx', () => {
  const baseRequest = { mutationId: 'mut-1', sourceId: 'src-1', fieldTimestamps: {} };

  describe('create (no entity)', () => {
    it('produces empty fieldTimestamps', () => {
      const result = buildStx(baseRequest);

      expect(result.fieldTimestamps).toEqual({});
      expect(result.mutationId).toBe('mut-1');
      expect(result.sourceId).toBe('src-1');
    });
  });

  describe('update (with entity + acceptedFieldNames)', () => {
    it('preserves mutationId and sourceId', () => {
      const entity = {
        stx: {
          mutationId: 'old',
          sourceId: 'old',
          fieldTimestamps: { name: '100:0001:aaaaa', status: '200:0001:bbbbb' },
        },
      };
      const stx = { mutationId: 'mut-1', sourceId: 'src-1', fieldTimestamps: { name: '300:0001:ccccc' } };
      const result = buildStx(stx, entity, ['name']);

      expect(result.mutationId).toBe('mut-1');
      expect(result.sourceId).toBe('src-1');
    });

    it('merges incoming HLC timestamps for accepted fields', () => {
      const entity = {
        stx: {
          mutationId: 'old',
          sourceId: 'old',
          fieldTimestamps: { name: '100:0001:aaaaa', status: '200:0001:bbbbb' },
        },
      };
      const stx = { mutationId: 'mut-1', sourceId: 'src-1', fieldTimestamps: { name: '300:0001:ccccc' } };
      const result = buildStx(stx, entity, ['name']);

      // Accepted fields use incoming HLC values; unchanged fields preserve stored HLCs.
      expect(result.fieldTimestamps.name).toBe('300:0001:ccccc');
      expect(result.fieldTimestamps.status).toBe('200:0001:bbbbb');
    });

    it('handles entity without stx (first tracked update)', () => {
      const stx = { mutationId: 'mut-1', sourceId: 'src-1', fieldTimestamps: { name: '100:0001:aaaaa' } };
      const result = buildStx(stx, undefined, ['name']);

      expect(result.fieldTimestamps.name).toBe('100:0001:aaaaa');
    });

    it('handles multiple accepted fields', () => {
      const entity = {
        stx: {
          mutationId: 'old',
          sourceId: 'old',
          fieldTimestamps: {
            name: '100:0001:aaaaa',
            status: '200:0001:bbbbb',
            description: '150:0001:aaaaa',
          },
        },
      };
      const stx = {
        mutationId: 'mut-1',
        sourceId: 'src-1',
        fieldTimestamps: { name: '300:0001:ccccc', description: '350:0001:ccccc' },
      };
      const result = buildStx(stx, entity, ['name', 'description']);

      expect(result.fieldTimestamps.name).toBe('300:0001:ccccc');
      expect(result.fieldTimestamps.description).toBe('350:0001:ccccc');
      expect(result.fieldTimestamps.status).toBe('200:0001:bbbbb');
    });

    it('does not timestamp accepted fields without an incoming timestamp', () => {
      const entity = {
        stx: { mutationId: 'old', sourceId: 'old', fieldTimestamps: { name: '100:0001:aaaaa' } },
      };
      const stx = { mutationId: 'mut-1', sourceId: 'src-1', fieldTimestamps: {} };
      const result = buildStx(stx, entity, ['status']);

      expect(result.fieldTimestamps.status).toBeUndefined();
      expect(result.fieldTimestamps.name).toBe('100:0001:aaaaa');
    });
  });
});
