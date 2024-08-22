import type { SubTask, Task } from '~/types';

// To sort Tasks by its status & order
export const sortTaskOrder = (task1: Pick<Task, 'status' | 'order'>, task2: Pick<Task, 'status' | 'order'>, reverse?: boolean) => {
  if (task1.status !== task2.status) return task2.status - task1.status;
  // same status, sort by order
  if (task1.order !== null && task2.order !== null) return reverse ? task1.order - task2.order : task2.order - task1.order;
  // order is null
  return 0;
};

export const getNewTaskOrder = (status: number, tasks: Task[] | SubTask[]) => {
  const filteredTasks = tasks.filter((t) => t.status === status).sort((a, b) => b.order - a.order);
  return filteredTasks.length > 0 ? filteredTasks[0].order + 1 : 1;
};

export const extractUniqueWordsFromHTML = (html: string) => {
  //Parse the HTML and extract text content
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const text = doc.body.textContent || '';

  // Split the text into words, normalize them, and remove non-alphanumeric characters
  const words = text
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .map((word) => word.replace(/[^a-z0-9]/g, ''))
    .filter((word) => word.length > 0);

  //Filter out duplicate words
  const uniqueWords = [...new Set(words)];

  return uniqueWords.join(' ');
};

export const taskExpandable = (summary: string, description: string) => {
  const parser = new DOMParser();
  //Parse the HTML and extract text content
  const summaryDoc = parser.parseFromString(summary, 'text/html');
  const descriptionDoc = parser.parseFromString(description, 'text/html');

  const summaryText = summaryDoc.body.textContent || '';
  const descriptionText = descriptionDoc.body.textContent || '';
  if (descriptionText.length === summaryText.length) return summaryText !== descriptionText;

  return true;
};
