import { createContext } from "react";
import type { Project } from "~/types";
import type { Label } from "../../common/electric/electrify";

interface ProjectContextValue {
  project: Project;
  labels: Label[];
  focusedProject: number | null;
  setFocusedProjectIndex: (index: number) => void;
}

export const ProjectContext = createContext({} as ProjectContextValue);
