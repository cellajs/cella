export type ModuleScope = 'backend' | 'frontend';

/** A module's manifest: its name, who maintains it and where it runs. The cella CLI never merges an `app` module. */
export interface ModuleConfig {
  name: string;
  owner: 'cella' | 'app';
  description: string;
  scope: ModuleScope[];
  /** When true, the module's operations drop from the generated docs and search, but stay in openapi.json and the SDK. */
  hidden?: boolean;
}

const modules: ModuleConfig[] = [];
const listeners: ((config: ModuleConfig) => void)[] = [];

/** Records a module's manifest and hands it to every listener. */
export const registerModule = (config: ModuleConfig) => {
  modules.push(config);
  listeners.forEach((listener) => {
    listener(config);
  });
};

/** Calls `listener` for every module, those registered before it included. */
export const onModuleRegister = (listener: (config: ModuleConfig) => void) => {
  listeners.push(listener);
  modules.forEach(listener);
};
