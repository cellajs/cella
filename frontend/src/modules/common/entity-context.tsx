import { createContext } from 'react';
import type { EntityPage, Organization, Project } from '~/types';

interface EntityContextValue {
  entity: EntityPage;
  isAdmin: boolean;
  organization?: Organization;
  project?: Project;
}

export const EntityContext = createContext({} as EntityContextValue);
