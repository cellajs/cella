import i18n from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import { ApiError } from '~/lib/api';
import { locales } from '~/lib/i18n-locales';
import { getErrorInfo } from '~/utils/get-error-info';

// The real English texts: the resolver's job is picking among them.
beforeAll(async () => {
  await i18n.init({ lng: 'en', resources: locales, ns: ['c', 'error'], defaultNS: 'c' });
});

describe('getErrorInfo', () => {
  it("describes an app's own error type by its texts in `appError.json`, ahead of the name and message the server rendered", () => {
    i18n.addResourceBundle('en', 'appError', { quota_reached: 'Quota reached', 'quota_reached.text': 'This plan holds no more rows.' });
    const error = new ApiError({ status: 429, type: 'quota_reached', name: 'Quotum bereikt', severity: 'warn', message: 'Dit abonnement is vol.' });

    expect(getErrorInfo({ error })).toEqual({ title: 'Quota reached', message: 'This plan holds no more rows.' });
    i18n.removeResourceBundle('en', 'appError');
  });

  it("takes the server's name and message for a type that has no text here, such as an app's own", () => {
    const error = new ApiError({ status: 409, type: 'seat_limit_reached', name: 'No seats left', message: 'Ask an admin to add seats.' });

    expect(getErrorInfo({ error })).toEqual({ title: 'No seats left', message: 'Ask an admin to add seats.' });
  });
});
