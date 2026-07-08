import { describe, expect, it } from 'vitest';
import { buildStx } from '#/core/stx/build-stx';
import { _resetHLC } from '#/core/stx/hlc';

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
        stx: { mutationId: 'old', sourceId: 'old', fieldTimestamps: { name: '100:0001:aaa', status: '200:0001:bbb' } },
      };
      const stx = { mutationId: 'mut-1', sourceId: 'src-1', fieldTimestamps: { name: '300:0001:ccc' } };
      const result = buildStx(stx, entity, ['name']);

      expect(result.mutationId).toBe('mut-1');
      expect(result.sourceId).toBe('src-1');
    });

    it('merges incoming HLC timestamps for accepted fields', () => {
      const entity = {
        stx: { mutationId: 'old', sourceId: 'old', fieldTimestamps: { name: '100:0001:aaa', status: '200:0001:bbb' } },
      };
      const stx = { mutationId: 'mut-1', sourceId: 'src-1', fieldTimestamps: { name: '300:0001:ccc' } };
      const result = buildStx(stx, entity, ['name']);

      // Accepted fields use incoming HLC values; unchanged fields preserve stored HLCs.
      expect(result.fieldTimestamps.name).toBe('300:0001:ccc');
      expect(result.fieldTimestamps.status).toBe('200:0001:bbb');
    });

    it('handles entity without stx (first tracked update)', () => {
      _resetHLC();
      const stx = { mutationId: 'mut-1', sourceId: 'src-1', fieldTimestamps: { name: '100:0001:aaa' } };
      const result = buildStx(stx, undefined, ['name']);

      expect(result.fieldTimestamps.name).toBe('100:0001:aaa');
    });

    it('handles multiple accepted fields', () => {
      const entity = {
        stx: {
          mutationId: 'old',
          sourceId: 'old',
          fieldTimestamps: { name: '100:0001:aaa', status: '200:0001:bbb', description: '150:0001:aaa' },
        },
      };
      const stx = {
        mutationId: 'mut-1',
        sourceId: 'src-1',
        fieldTimestamps: { name: '300:0001:ccc', description: '350:0001:ccc' },
      };
      const result = buildStx(stx, entity, ['name', 'description']);

      expect(result.fieldTimestamps.name).toBe('300:0001:ccc');
      expect(result.fieldTimestamps.description).toBe('350:0001:ccc');
      expect(result.fieldTimestamps.status).toBe('200:0001:bbb');
    });

    it('generates server HLC for accepted fields without incoming timestamp', () => {
      _resetHLC();
      const entity = {
        stx: { mutationId: 'old', sourceId: 'old', fieldTimestamps: { name: '100:0001:aaa' } },
      };
      const stx = { mutationId: 'mut-1', sourceId: 'src-1', fieldTimestamps: {} };
      const result = buildStx(stx, entity, ['status']);

      // status has no incoming HLC and no existing → server generates one
      expect(result.fieldTimestamps.status).toBeDefined();
      expect(typeof result.fieldTimestamps.status).toBe('string');
      // name preserved from existing
      expect(result.fieldTimestamps.name).toBe('100:0001:aaa');
    });
  });
});
