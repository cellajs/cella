import { generateId } from 'shared/utils/entity-id';
import { generateServerHLC } from '#/core/stx/hlc';
import { mockUuid, withFakerSeed } from '#/mocks';

export const mockStxBase = (key = 'stx-base:default') =>
  withFakerSeed(key, () => ({ mutationId: mockUuid(), sourceId: mockUuid(), fieldTimestamps: {} }));

/**
 * The stx of one test write: a mutation id of its own and a stamp for each field the write changes. A create or a
 * delete names no field.
 */
export const mockStxFor = (...fields: string[]) => ({
  ...mockStxBase(`stx:${generateId()}`),
  fieldTimestamps: Object.fromEntries(fields.map((field) => [field, generateServerHLC('test-client')])),
});
