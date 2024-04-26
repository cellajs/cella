import { http, HttpResponse } from 'msw';
import { labelsContent, type MockResponse, projectsWithTaskContent, labelsTable } from './dataGeneration';

/** Mock server handlers */
export const handlers = [
  http.get('/mock/kanban', () => {
    const responseProjectContent = projectsWithTaskContent(3);
    return HttpResponse.json<MockResponse>({
      project: responseProjectContent,
      workspace: { labelGroups: labelsContent(), labelsTable: labelsTable() },
    });
  }),
];
