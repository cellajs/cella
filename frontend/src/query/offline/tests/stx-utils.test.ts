import { describe, expect, it } from 'vitest';
import { sourceId } from '~/query/offline/hlc';
import { createStxForCreate, createStxForDelete, createStxForUpdate } from '~/query/offline/stx-utils';

// The stamp shape the backend's stx schema validates (backend/src/schemas/sync-transaction-schemas.ts).
describe('stx stamps', () => {
  it("stamps each write with a fresh mutation id and this tab's source, and an update with a valid HLC per changed field", () => {
    const create = createStxForCreate();
    const update = createStxForUpdate(['name', 'status']);
    const remove = createStxForDelete();

    // The mutation id is the server's idempotency key: two writes never share one.
    expect(new Set([create, createStxForCreate(), update, remove].map(({ mutationId }) => mutationId)).size).toBe(4);
    for (const stx of [create, update, remove]) expect(stx.sourceId).toBe(sourceId);
    // Creates and deletes carry no field timestamps: the server assigns the initial values.
    expect(create.fieldTimestamps).toEqual({});
    expect(remove.fieldTimestamps).toEqual({});
    // `millis:counter:sourceHash`, the pattern the backend's `isValidHLC` accepts.
    expect(Object.keys(update.fieldTimestamps)).toEqual(['name', 'status']);
    for (const timestamp of Object.values(update.fieldTimestamps)) expect(timestamp).toMatch(/^\d+:\d{4,}:[0-9a-z]{5}$/);
  });
});
