import { appConfig, hierarchy } from 'shared';
import { describe, expect, it } from 'vitest';
import { benchAttachmentHome } from '../seeds/attachment-home';

describe('bench attachment home', () => {
  const nullable = new Set<string>(hierarchy.getNullableAncestors('attachment'));
  const strictColumns = hierarchy
    .getOrderedAncestors('attachment')
    .filter((type) => type !== 'organization' && !nullable.has(type))
    .map((type) => appConfig.entityIdColumnKeys[type]);

  it('names a channel for every ancestor an attachment cannot do without', () => {
    // An app whose attachments live in a channel fills `benchAttachmentHome`: without it the seed insert fails on the
    // foreign key and every create of the churn scenario answers 400.
    for (const index of [0, 1, 999]) expect(Object.keys(benchAttachmentHome(index))).toEqual(expect.arrayContaining(strictColumns));
  });
});
