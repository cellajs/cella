import type { EntityPage, Organization, Project } from "~/types";
import { createContext } from 'react';

interface EntityContextValue {
  entity: EntityPage;
  isAdmin: boolean;
  organization?: Organization;
  project?: Project;
}

export const EntityContext = createContext({} as EntityContextValue);
