import _default, { type DeepPartial } from './default';
import development from './development';
import production from './production';
import staging from './staging';
import tunnel from './tunnel';

/**
 * All entities in this app
 */
export type EntityType = (typeof _default.entityTypes)[number];

/**
 * Page entities (entities with memberships + users)
 */
export type PageEntityType = (typeof config.pageEntityTypes)[number];

/**
 * Context entities (entities with memberships only)
 */
export type ContextEntityType = (typeof _default.contextEntityTypes)[number];

/**
 * Product entities aka (user-generated) content (no memberships assigned)
 */
export type ProductEntityType = (typeof _default.productEntityTypes)[number];

/**
 * Menu sections in the menu structure
 */
export type MenuSection = {
  entityType: ContextEntityType;
  subentityType: ContextEntityType | null;
};

/**
 * OAuth providers enabled in this app
 */
export type EnabledOauthProvider = (typeof _default.enabledOauthProviders)[number];

/**
 * Upload template IDs
 */
export type UploadTemplateId = (typeof _default.uploadTemplateIds)[number];

/**
 * Language options
 */
export type Language = (typeof _default.languages)[number];

/**
 * Theme options
 */
export type Theme = keyof typeof _default.theme.colors | 'none';
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
  tunnel,
  staging,
  production,
};

type ConfigMode = keyof typeof configModes;

const mode = (process.env.NODE_ENV || 'development') as ConfigMode;
export const config = mergeDeep(_default, configModes[mode]);
