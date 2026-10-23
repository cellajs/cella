import { createExtension, createStore, type ExtensionOptions } from '@blocknote/core';

interface CheckedExtensionOptions {
  /** A checkbox toggles its item; default false renders the checkboxes disabled. */
  persisted?: boolean;
}

/** Checklist checkbox state; a host's own instance, passed in `extensions`, wins over the one each editor adds. */
export const checkedExtension = createExtension(({ options }: ExtensionOptions<CheckedExtensionOptions | undefined>) => ({
  key: 'checkboxes-state' as const,
  store: createStore<{ persisted: boolean }>({ persisted: options?.persisted ?? false }),
}));
