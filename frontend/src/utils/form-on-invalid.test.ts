import i18n from 'i18next';
import { isValidElement, type ReactElement } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { locales } from '~/lib/i18n-locales';

const toaster = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster }));

const { defaultOnInvalid } = await import('~/utils/form-on-invalid');

/** The lines of the toast the handler showed. */
const toastedLines = () => {
  const description = toaster.error.mock.lastCall?.[1]?.description as ReactElement<{ children: ReactElement<{ children: string }>[] }>;
  expect(isValidElement(description)).toBe(true);
  return description.props.children.map((line) => line.props.children);
};

beforeAll(async () => {
  await i18n.init({ lng: 'en', resources: locales, ns: ['c', 'error'], defaultNS: 'c' });
});

describe('defaultOnInvalid', () => {
  beforeEach(() => {
    toaster.error.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows the message a rule of the form wrote itself, and the text of the type for a built-in rule', () => {
    defaultOnInvalid({
      description: { type: 'custom', message: 'Add a file or a description' },
      name: { type: 'too_small', message: 'Too small: expected string to have >=2 characters' },
    });

    expect(toastedLines()).toEqual(['Description: Add a file or a description', 'Name: Value is too small']);
  });

  it('shows the text of the type for a rule that wrote no message', () => {
    defaultOnInvalid({ description: { type: 'custom' } });

    expect(toastedLines()).toEqual(['Description: Invalid input']);
  });
});
