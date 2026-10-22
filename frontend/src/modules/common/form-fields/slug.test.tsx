// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { checkSlug } = vi.hoisted(() => ({ checkSlug: vi.fn(async (_request: { body: { slug: string } }) => undefined) }));
vi.mock('sdk', () => ({ checkSlug }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('~/hooks/use-online-manager', () => ({ useOnlineManager: () => true }));

const { SlugFormField } = await import('~/modules/common/form-fields/slug');
const { Form } = await import('~/modules/ui/field');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function SlugForm({ nameValue }: { nameValue?: string }) {
  const form = useForm({ defaultValues: { slug: '' } });
  return (
    <Form {...form}>
      <SlugFormField control={form.control} label="Handle" entityType="organization" tenantId="ten-1" nameValue={nameValue} />
    </Form>
  );
}

/** Types into the field as a browser does: the element takes the value, then the input event fires. */
const type = async (input: HTMLInputElement, value: string) => {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('SlugFormField', () => {
  const container = document.createElement('div');
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    root = createRoot(container);
    checkSlug.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => act(() => root.unmount()));

  /** The slug the field holds once it derived one from `nameValue` and heard back from the availability check. */
  const derivedFrom = async (nameValue: string) => {
    await act(async () => root.render(<QueryClientProvider client={new QueryClient()}>{<SlugForm nameValue={nameValue} />}</QueryClientProvider>));
    return (container.querySelector('input') as HTMLInputElement).value;
  };

  it('derives a valid slug from a name too short or in a script slugify cannot spell', async () => {
    expect(await derivedFrom('Acme Team')).toBe('acme-team');
    expect(await derivedFrom('X')).toMatch(/^x-[a-z0-9]{4}$/);
    expect(await derivedFrom('项目')).toMatch(/^organization-[a-z0-9]{4}$/);
  });

  it('moves a derived slug that is taken to a free variant', async () => {
    checkSlug.mockImplementation(async ({ body }) => {
      if (body.slug === 'acme') throw Object.assign(new Error('taken'), { status: 409 });
    });

    expect(await derivedFrom('Acme')).toMatch(/^acme-[a-z0-9]{4}$/);
  });

  it('holds what is typed in the form a slug is stored in, and checks that form', async () => {
    await act(async () => root.render(<QueryClientProvider client={new QueryClient()}>{<SlugForm />}</QueryClientProvider>));
    const input = container.querySelector('input') as HTMLInputElement;

    await type(input, 'Acme-Team');

    expect(input.value).toBe('acme-team');
    expect(checkSlug.mock.lastCall?.[0].body).toMatchObject({ slug: 'acme-team' });
  });
});
