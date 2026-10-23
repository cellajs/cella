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

function SlugForm() {
  const form = useForm({ defaultValues: { slug: '' } });
  return (
    <Form {...form}>
      <SlugFormField control={form.control} label="Handle" entityType="organization" tenantId="ten-1" />
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

  it('holds what is typed in the form a slug is stored in, and checks that form', async () => {
    await act(async () => root.render(<QueryClientProvider client={new QueryClient()}>{<SlugForm />}</QueryClientProvider>));
    const input = container.querySelector('input') as HTMLInputElement;

    await type(input, 'Acme-Team');

    expect(input.value).toBe('acme-team');
    expect(checkSlug.mock.lastCall?.[0].body).toMatchObject({ slug: 'acme-team' });
  });
});
