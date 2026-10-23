import { describe, expect, it } from 'vitest';
import { preserveIncluded } from '~/query/basic/preserve-included';

const cached = { id: 'org-1', name: 'Acme', included: { counts: { members: 3 }, membership: { role: 'admin' } } };

describe('preserveIncluded', () => {
  it('keeps the included parts a response leaves out, and the cached objects a response repeats', () => {
    const renamed = preserveIncluded(cached, { id: 'org-1', name: 'Acme Inc' });
    expect(renamed).toEqual({ ...cached, name: 'Acme Inc' });
    expect((renamed as typeof cached).included).toBe(cached.included);

    const recounted = preserveIncluded(cached, { id: 'org-1', name: 'Acme', included: { counts: { members: 4 } } });
    expect(recounted).toEqual({ ...cached, included: { counts: { members: 4 }, membership: { role: 'admin' } } });

    expect(preserveIncluded(cached, { id: 'org-1', name: 'Acme', included: { counts: { members: 3 } } })).toBe(cached);
  });
});
