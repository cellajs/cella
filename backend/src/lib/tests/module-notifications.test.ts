import { describe, expect, it } from 'vitest';
import type { BackendModule, ModuleNotifications, NotificationSubjectRow } from '#/lib/module';

/** A subject row of a module whose product hangs under a host row, as a comment under an item. */
type ThreadRow = NotificationSubjectRow & { hostId: string | null };

describe('ModuleNotifications', () => {
  it('types the row readers to the row of the module, with no cast per field', async () => {
    const declaration: ModuleNotifications<ThreadRow> = {
      resolveRecipients: async (_tx, row) => (row.hostId ? [{ userId: row.hostId, type: 'mention' }] : []),
      resolveContextId: (row) => row.hostId,
    };
    // The registry holds the base type: a declaration typed to its own row fits it.
    const registered: BackendModule['notifications'] = declaration;

    const row: ThreadRow = { id: 'row-1', createdBy: null, organizationId: 'org-1', hostId: 'host-1' };
    expect(declaration.resolveContextId?.(row)).toBe('host-1');
    expect(registered).toBe(declaration);
  });
});
