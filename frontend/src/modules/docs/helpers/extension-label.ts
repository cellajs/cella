import type { GenExtensionDefinition } from 'sdk/docs-types';
import { upperFirst } from '~/modules/docs/helpers/upper-first';

/** The name of a middleware extension as a table column and a detail row show it: `x-rate-limiter` reads "Rate limiter". */
export const extensionLabel = (ext: GenExtensionDefinition) => upperFirst(ext.key.replace('x-', '').replace(/-/g, ' '));
