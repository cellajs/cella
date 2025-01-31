import type { ContextEntity } from 'config';
import type { ContextEntityIdFields } from './db/types';
import type { entityTables, menuSections } from './entity-config';

type EntityTables = (typeof entityTables)[keyof typeof entityTables];

export type EntityTableNames = EntityTables['_']['name'];

export type MenuSection = {
  name: (typeof menuSections)[number]['name'];
  entityType: ContextEntity;
  submenu?: {
    entityType: ContextEntity;
    parentField: ContextEntityIdFields;
  };
};
export type MenuSectionName = MenuSection['name'];
