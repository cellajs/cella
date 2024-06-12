import type { EntityPage, Organization, Project } from "~/types";
import { createContext } from 'react';

interface EntityContextValue {
  entity: EntityPage ;
  organization?: Organization;
  project?: Project;
}

export const EntityContext = createContext({} as EntityContextValue);
