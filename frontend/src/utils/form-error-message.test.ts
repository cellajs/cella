import i18n from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { locales } from '~/lib/i18n-locales';
import { formErrorMessage } from '~/utils/form-error-message';

/** The message zod gives for `value`, through the app's error map. */
const messageOf = (schema: z.ZodType, value: unknown) => schema.safeParse(value).error?.issues[0]?.message;

const name = z
  .string()
  .min(2)
  .max(255)
  .regex(/^[\p{L}\d\-., '&()]+$/u);

beforeAll(async () => {
  await i18n.init({ lng: 'en', resources: locales, ns: ['c', 'error'], defaultNS: 'c', keySeparator: false, interpolation: { escapeValue: false } });
  z.config({ customError: formErrorMessage });
});

describe('formErrorMessage', () => {
  it('asks for a value the user left out, whatever rule it failed', () => {
    expect(messageOf(z.object({ name: z.string() }), {})).toBe('Required');
    expect(messageOf(name, '')).toBe('Required');
    expect(messageOf(z.enum(['admin', 'member']), undefined)).toBe('Required');
    expect(messageOf(z.array(z.email()).min(1), [])).toBe('Required');
  });

  it('names the length a text needs', () => {
    expect(messageOf(name, 'A')).toBe('Use at least 2 characters');
    expect(messageOf(z.string().max(5), 'abcdef')).toBe('Use at most 5 characters');
  });

  it('names the characters a one-class pattern refuses', () => {
    expect(messageOf(name, 'Q3: Roadmap / Ops')).toBe('Remove “:” and “/”');
  });

  it('describes the expected form of an email address, a web address and a prefix', () => {
    expect(messageOf(z.email(), '')).toBe('Enter an email address like name@example.com');
    expect(messageOf(z.url(), 'example')).toBe('Enter a web address like https://example.com');
    expect(messageOf(z.string().startsWith('https://'), 'http://example.com')).toBe('Start with https://');
  });

  it('falls back to a general line for a pattern it cannot explain', () => {
    expect(messageOf(z.string().regex(/^\d{6}$/), '12a')).toBe('Check the format');
  });

  it('keeps a message the schema sets', () => {
    expect(messageOf(z.string().min(2, 'Name needs two letters'), 'A')).toBe('Name needs two letters');
  });

  it('names the bounds of a number and a list', () => {
    expect(messageOf(z.number().min(1), 0)).toBe('Enter 1 or more');
    expect(messageOf(z.number().lt(10), 10)).toBe('Enter less than 10');
    expect(messageOf(z.array(z.string()).max(2), ['a', 'b', 'c'])).toBe('Choose at most 2');
    expect(messageOf(z.number(), 'ten')).toBe('Enter a number');
  });
});
