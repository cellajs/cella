import { afterEach, describe, expect, it } from 'vitest';
import { AppError } from '#/core/error';
import { i18n } from '#/lib/i18n';

const appErrors = i18n.getResourceBundle('en', 'appError') ?? {};

afterEach(() => {
  i18n.removeResourceBundle('en', 'appError');
  i18n.addResourceBundle('en', 'appError', appErrors);
});

describe('AppError', () => {
  // Contract: the text a person reads fills `{{resource}}` with the entity type's label, and with nothing without one,
  // in its plain and lowercased form alike: never with the slot's braces.
  it("fills the resource slot of its text with the entity type's label, or with nothing", () => {
    i18n.addResourceBundle('en', 'appError', { 'channel_archived.text': 'Plain {{resource}}, lowercased {{resource, lowercase}}.' }, true, true);

    expect(new AppError(403, 'channel_archived', 'warn', { entityType: 'organization' }).message).toBe(
      'Plain Organization, lowercased organization.',
    );
    expect(new AppError(403, 'channel_archived', 'warn').message).toBe('Plain , lowercased .');
  });
});
