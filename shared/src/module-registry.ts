export type ModuleScope = 'backend' | 'frontend' | 'both';

export interface ModuleConfig {
  name: string;
  owner: 'cella' | 'app';
  description: string;
  scope: ModuleScope;
  /** When true, the module is opt-in at scaffold time; its folder is removed if deselected. */
  optional?: boolean;
}

const modules: ModuleConfig[] = [];
const listeners: ((config: ModuleConfig) => void)[] = [];

export const registerModule = (config: ModuleConfig) => {
  modules.push(config);
  listeners.forEach((fn) => fn(config));
};

export const getModules = (filter?: { scope?: ModuleScope }): ModuleConfig[] => {
  if (!filter) return [...modules];
  return modules.filter((m) => !filter.scope || m.scope === filter.scope);
};

export const onModuleRegister = (fn: (config: ModuleConfig) => void) => {
  listeners.push(fn);
  modules.forEach(fn);
};
