import { http, HttpResponse } from 'msw';
import { faker } from '@faker-js/faker';

/** Mock server handlers */
export const handlers = [
  /** Fetch kanban-board data */
  http.get('/mock/kanban', () => {
    const statusValues = ['todo', 'in-progress', 'done'];
    const responseContent = Array.from({ length: 13 }, () => ({
      id: faker.string.uuid(),
      columnId: statusValues[Math.floor(Math.random() * statusValues.length)],
      content: faker.lorem.text(),
    }));
    return HttpResponse.json(responseContent);
  }),
];
