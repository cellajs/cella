import { createExtension, createStore, type ExtensionOptions } from '@blocknote/core';

export type CheckboxEntry = {
  id: string;
  checked: boolean;
};

type CheckboxExtensionOptions = { checkboxes?: CheckboxEntry[]; persisted?: boolean };

export const checkboxesExtension = createExtension(
  ({ options }: ExtensionOptions<CheckboxExtensionOptions | undefined>) => ({
    key: 'checkboxes-state' as const,
    store: createStore<{ checkboxes: CheckboxEntry[]; persisted: boolean }>({
      checkboxes: options?.checkboxes ?? [],
      persisted: options?.persisted ?? false,
    }),
  }),
);
