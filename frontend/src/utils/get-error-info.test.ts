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
  it('describes a typed error by its title and its explanation', () => {
    const error = new ApiError({ status: 500, type: 'server_error', severity: 'error', message: 'Internal server error' });

    expect(getErrorInfo({ error })).toEqual({
      title: 'Server error',
      message: 'Something went wrong on our side, so this was not completed.',
    });
  });

  it('prefers the resource form when the error names an entity type, and falls back to the plain type', () => {
    const notFound = new ApiError({ status: 404, type: 'not_found', entityType: 'attachment', severity: 'warn' });
    expect(getErrorInfo({ error: notFound })).toEqual({
      title: 'Attachment not found ',
      message: 'This attachment does not exist or has been deleted.',
    });

    // No `resource_last_admin` key exists.
    const lastAdmin = new ApiError({ status: 409, type: 'last_admin', entityType: 'organization', severity: 'warn' });
    expect(getErrorInfo({ error: lastAdmin }).title).toBe('An admin is needed');
  });

  it('shows the sentence the server sent when the type has no explanation of its own', () => {
    const error = new ApiError({
      status: 400,
      type: 'form.too_small',
      severity: 'error',
      message: 'Too small: expected string to have >=2 characters',
    });

    expect(getErrorInfo({ error })).toEqual({ title: 'Value is too small', message: 'Too small: expected string to have >=2 characters' });
  });

  it('leaves the message empty when it would repeat the title or is a stand-in for a missing one', () => {
    const repeated = new ApiError({ status: 409, type: 'slug_exists', severity: 'warn', message: 'Slug already exists' });
    expect(getErrorInfo({ error: repeated })).toEqual({ title: 'Slug already exists', message: '' });

    // Built in the browser without a message: the constructor fills in the type.
    const bare = new ApiError({ status: 409, type: 'slug_exists' });
    expect(getErrorInfo({ error: bare })).toEqual({ title: 'Slug already exists', message: '' });
  });

  it("takes the server's name and message for a type that has no text here, such as an app's own", () => {
    const error = new ApiError({ status: 409, type: 'seat_limit_reached', name: 'No seats left', message: 'Ask an admin to add seats.' });

    expect(getErrorInfo({ error })).toEqual({ title: 'No seats left', message: 'Ask an admin to add seats.' });
  });

  it('describes an error without type or name by what its status means', () => {
    expect(getErrorInfo({ error: new ApiError({ status: 403 }) })).toEqual({
      title: 'Forbidden: Not allowed to perform this action',
      message: '',
    });
    expect(getErrorInfo({ error: new ApiError({ status: 418 as never }) })).toEqual({ title: 'Error', message: '' });
  });

  it("shows the server's sentence for an info error", () => {
    const error = new ApiError({ status: 409, type: 'field_conflict', severity: 'info', message: 'Saved elsewhere a moment ago.' });

    expect(getErrorInfo({ error })).toEqual({ title: 'Field conflict', message: 'Saved elsewhere a moment ago.' });
  });

  it('describes an error type read from the search params, and any other thrown error by its own name and message', () => {
    expect(getErrorInfo({ errorFromQuery: 'oauth_failed' })).toEqual({
      title: 'OAuth failed',
      message: 'Please try again or use another method.',
    });
    expect(getErrorInfo({ error: new TypeError('x is not a function') })).toEqual({ title: 'TypeError', message: 'x is not a function' });
    expect(getErrorInfo({})).toEqual({ title: 'Error', message: 'Unknown error.' });
  });
});
