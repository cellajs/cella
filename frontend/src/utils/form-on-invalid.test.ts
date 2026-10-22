// @vitest-environment jsdom
import i18n from 'i18next';
import { type BaseSyntheticEvent, isValidElement, type ReactElement } from 'react';
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

  it('shows the message the field shows, a translation key translated', () => {
    defaultOnInvalid({
      description: { type: 'custom', message: 'Add a file or a description' },
      name: { type: 'too_small', message: 'Use at least 2 characters' },
      organizationId: { type: 'required', message: 'error:form.required' },
    });

    expect(toastedLines()).toEqual(['Description: Add a file or a description', 'Name: Use at least 2 characters', 'Organization ID: Required']);
  });

  /** A submitted form holding a visible `name` input and a hidden `email` one, as the submit event names it. */
  const submitOf = () => {
    const form = document.body.appendChild(document.createElement('form'));
    const name = form.appendChild(Object.assign(document.createElement('input'), { name: 'name' }));
    // jsdom lays nothing out: a rendered input has one box
    name.getClientRects = () => [new DOMRect()] as unknown as DOMRectList;
    form.appendChild(Object.assign(document.createElement('input'), { name: 'email' }));
    // A stand-in for React's submit event: the handler reads its `target` only
    return { target: form } as unknown as BaseSyntheticEvent;
  };

  it('toasts only the errors no field shows: one whose input is hidden, and none when every field shows its own', () => {
    defaultOnInvalid(
      { name: { type: 'too_small', message: 'Required' }, email: { type: 'invalid_format', message: 'Enter an email address' } },
      submitOf(),
    );
    expect(toastedLines()).toEqual(['Email: Enter an email address']);

    toaster.error.mockClear();
    defaultOnInvalid({ name: { type: 'too_small', message: 'Required' } }, submitOf());
    expect(toaster.error).not.toHaveBeenCalled();
  });
});
