import { describe, expect, it } from 'vitest';
import { type BootAccountReader, releaseAccounts } from './boot-accounts';

const account = (release: string, rc = 0) => `service=backend\nrelease=${release}\nboot_rc=${rc}\n\nboot log`;

function reader(objects: Record<string, string>): BootAccountReader {
  return { list: async () => Object.keys(objects), read: async (key) => objects[key] ?? '' };
}

describe('a release’s boot accounts', () => {
  it('must not take an older release’s account for the deploying one: a machine that never reported has none', async () => {
    const objects = {
      'backend-20261024T100000Z-boot.log': account('a'.repeat(40)),
      'backend-20261024T100000Z-events.jsonl': '{}',
      'cdc-20261025T090000Z-boot.log': account('b'.repeat(40), 1),
    };
    const [backend, cdc] = await releaseAccounts(reader(objects), ['backend', 'cdc'], 'bbbbbbb');
    expect(backend).toEqual({ service: 'backend', newestOther: { key: 'backend-20261024T100000Z-boot.log', release: 'a'.repeat(40) } });
    expect(cdc?.account).toMatchObject({ key: 'cdc-20261025T090000Z-boot.log', failed: true });
  });
});
