import { http, HttpResponse } from 'msw';
import { taskContent, projectsContent, labelsContent, type MockResponse } from './dataGeneration';

/** Mock server handlers */
export const handlers = [
  /** Fetch kanban-board data */
  http.get('/mock/kanban', () => {
    const responseProjectContent = projectsContent();
    const responseTaskContent = taskContent(20);
    const labels = labelsContent();
    return HttpResponse.json<MockResponse>({ workspace: { labelGroups: labels }, task: responseTaskContent, project: responseProjectContent });
  }),
];
