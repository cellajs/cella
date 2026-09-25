import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from '../../../../emails/i18n';
import { type DigestSection, renderSectionsHtml } from './build-digest';

const section: DigestSection = {
  channelId: 'c1',
  channelName: 'Ontwerp',
  lines: ['Nieuwe reactie op <strong>Roadmap</strong>'],
  overflow: 3,
};

describe('renderSectionsHtml', () => {
  const saved = structuredClone(i18n.getResourceBundle('nl', 'c') ?? {});

  afterEach(() => {
    i18n.removeResourceBundle('nl', 'c');
    i18n.addResourceBundle('nl', 'c', saved);
  });

  it("writes the overflow line in the recipient's language", () => {
    i18n.addResourceBundle('nl', 'c', { 'email.digest_overflow': 'en nog {{count}}' }, true, true);

    expect(renderSectionsHtml([section], 'nl')).toBe(
      '<h3>Ontwerp</h3><ul><li>Nieuwe reactie op <strong>Roadmap</strong></li><li>en nog 3</li></ul>',
    );
    expect(renderSectionsHtml([section], 'en')).toContain('<li>and 3 more</li>');
  });

  it('leaves the overflow line out when every row is quoted', () => {
    expect(renderSectionsHtml([{ ...section, overflow: 0 }], 'en')).toBe(
      '<h3>Ontwerp</h3><ul><li>Nieuwe reactie op <strong>Roadmap</strong></li></ul>',
    );
  });
});
