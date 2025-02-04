import _default, { type DeepPartial } from './default';
import development from './development';
import production from './production';
import tunnel from './tunnel';

/**
 * All entity types used in this app
 */
export type Entity = (typeof _default.entityTypes)[number];

/**
 * Page entity types (pages with memberships + users)
 */
export type PageEntity = (typeof config.pageEntityTypes)[number];

/**
 * Context entity types (memberships)
 */
export type ContextEntity = (typeof _default.contextEntityTypes)[number];

/**
 * Product entity types (mostly content)
 */
export type ProductEntity = (typeof _default.productEntityTypes)[number];

/**
 * OAuth providers enabled in this app
 */
export type EnabledOauthProvider = (typeof _default.enabledOauthProviders)[number];

/**
 * Language options
 */
export type Language = (typeof _default.languages)[number]['value'];

/**
 * Severity levels to be used in error handling
 */
export type Severity = (typeof _default.severityLevels)[number];

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

type ConfigMode = keyof typeof configModes;

const mode = (process.env.NODE_ENV || 'development') as ConfigMode;
export const config = mergeDeep(_default, configModes[mode]);
