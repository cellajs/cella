import { http, HttpResponse } from 'msw';
import { getProjects, getLabels, getTasks } from './dataGeneration';

/** Mock server handlers */
export const handlers = [
  http.get('/mock/workspace-data', () => {
    const projects = getProjects(3)
    return HttpResponse.json({
      projects,
      labels: getLabels(),
      tasks: getTasks(projects),
    });
  }),
];
