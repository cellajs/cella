// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('~/query/idb-kv-storage', () => ({
  flushKvWrites: vi.fn(),
  idbKvStorage: () => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} }),
}));

const { useFormWithDraft } = await import('~/modules/common/form-draft/use-draft-form');
const { useDraftStore } = await import('~/modules/common/form-draft/draft-store');
const { formResolver } = await import('~/utils/form-resolver');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const schema = z.object({
  name: z.string().min(1),
  shortName: z.string().nullish(),
  welcomeText: z.string().nullish(),
  languageCodes: z.array(z.string()),
});

type Values = z.infer<typeof schema>;
type DraftForm = ReturnType<typeof useFormWithDraft<Values>>;

const formId = 'test-form';
const defaults: Values = { name: 'Acme', shortName: 'AC', welcomeText: '', languageCodes: ['en'] };

let form: DraftForm;

function Harness({ defaultValues }: { defaultValues: Values }) {
  form = useFormWithDraft<Values>(formId, { formOptions: { resolver: formResolver(schema), defaultValues } });
  return null;
}

const edit = (name: keyof Values, value: Values[keyof Values]) => act(() => form.setValue(name, value, { shouldDirty: true }));

/** Submits through `handleChanges` and returns the changes it handed over. */
const submitChanges = async (onChanges?: (changes: Partial<Values>, values: Values) => void) => {
  let submitted: Partial<Values> | undefined;
  await act(() =>
    form.handleChanges((changes, values) => {
      submitted = changes;
      onChanges?.(changes, values);
    })(),
  );
  return submitted;
};

describe('useFormWithDraft handleChanges', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  const mount = (defaultValues: Values) => {
    container = document.createElement('div');
    root = createRoot(container);
    return act(() => root.render(<Harness defaultValues={defaultValues} />));
  };

  beforeEach(async () => {
    useDraftStore.getState().reset();
    await mount(defaults);
  });
  afterEach(() => act(() => root.unmount()));

  it('hands over the one field edited', async () => {
    await edit('name', 'Acme Inc');
    expect(await submitChanges()).toEqual({ name: 'Acme Inc' });
  });

  it('hands over a cleared field as null', async () => {
    await edit('shortName', '');
    expect(await submitChanges()).toEqual({ shortName: null });
  });

  it('leaves out a field edited back to its default', async () => {
    await edit('name', 'Acme Inc');
    await edit('shortName', 'AI');
    await edit('name', 'Acme');
    expect(await submitChanges()).toEqual({ shortName: 'AI' });
  });

  it('hands over nothing for an untouched form with a blank default', async () => {
    expect(await submitChanges()).toEqual({});
  });

  it('hands over only the second edit after a save resets to the response', async () => {
    await edit('name', 'Acme Inc');
    await submitChanges((_changes, values) => form.reset(values));
    await edit('shortName', 'AI');
    expect(await submitChanges()).toEqual({ shortName: 'AI' });
  });

  it('restores a draft over newer defaults with only the fields the user edited', async () => {
    await edit('name', 'Acme Inc');
    await act(() => root.unmount());
    expect(useDraftStore.getState().getForm(formId)).toEqual({ name: 'Acme Inc' });

    await mount({ ...defaults, shortName: 'ACME', languageCodes: ['en', 'nl'] });
    expect(await submitChanges()).toEqual({ name: 'Acme Inc' });
    expect(useDraftStore.getState().getForm(formId)).toEqual({ name: 'Acme Inc' });
  });

  it('hands over an edited array whole', async () => {
    await edit('languageCodes', ['en', 'nl']);
    expect(await submitChanges()).toEqual({ languageCodes: ['en', 'nl'] });
  });
});
