import { createExtension, createStore, type ExtensionOptions } from '@blocknote/core';

type CheckedExtensionOptions = { persisted?: boolean };

export const checkedExtension = createExtension(
  ({ options }: ExtensionOptions<CheckedExtensionOptions | undefined>) => ({
    key: 'checkboxes-state' as const,
    store: createStore<{ persisted: boolean }>({
      persisted: options?.persisted ?? false,
    }),
  }),
);
