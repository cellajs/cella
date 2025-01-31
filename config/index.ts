import _default, { type DeepPartial } from './default';
import development from './development';
import production from './production';
import tunnel from './tunnel';

function isObject(item: object) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

function mergeDeep<T extends {}, U extends DeepPartial<T>>(target: T, ...sources: U[]) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && source && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key as keyof object])) {
        if (!target[key as keyof object]) Object.assign(target, { [key]: {} });
        mergeDeep(target[key as keyof object], source[key as keyof object]);
      } else {
        Object.assign(target, { [key]: source[key as keyof object] });
      }
    }
  }

  return mergeDeep(target, ...sources);
}

const configModes = {
  development,
  production,
  tunnel,
};

const mode = (process.env.NODE_ENV || 'development') as keyof typeof configModes;
export const config = mergeDeep(_default, configModes[mode]);

export type Entity = (typeof config.entityTypes)[number];
export type ProductEntity = (typeof config.productEntityTypes)[number];
export type ContextEntity = (typeof config.contextEntityTypes)[number];
export type PageEntity = (typeof config.pageEntityTypes)[number];
export type EntityRoles = (typeof config.rolesByType.entityRoles)[number];
export type Language = (typeof config.languages)[number]['value'];

export type SystemRoles = (typeof config.rolesByType.systemRoles)[number];

export type EnabledOauthProvider = (typeof config.enabledOauthProviders)[number];

export type AllowedAuthStrategies = (typeof config.enabledAuthenticationStrategies)[number];
