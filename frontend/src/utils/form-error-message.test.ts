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
});
