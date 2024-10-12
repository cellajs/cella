import fs from 'node:fs';
import { Command } from '@commander-js/extra-typings';
import { eq } from 'drizzle-orm';
import JSZip from 'jszip';
import { nanoid } from 'nanoid';
import papaparse from 'papaparse';
import { db } from '#/db/db';
import { labelsTable } from '#/db/schema/labels';
import { projectsTable } from '#/db/schema/projects';
import { type InsertTaskModel, tasksTable } from '#/db/schema/tasks';
import { extractKeywords } from '#/modules/tasks/helpers';
import { getLabels, getSubtask, getTaskLabels } from './helper';
import type { PivotalTask } from './type';

const program = new Command().option('--file <file>', 'Zip file to upload').option('--project <project>', 'Project to upload tasks to').parse();

const options = program.opts();
const zipFile = options.file;
const projectId = options.project;

if (!zipFile) {
  console.error('Please provide a zip file');
  process.exit(1);
}

if (!projectId) {
  console.error('Please provide a project id');
  process.exit(1);
}

const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));

if (!project) {
  console.error('Project not found');
  process.exit(1);
}

const zip = new JSZip();
const data = fs.readFileSync(zipFile);
zip.loadAsync(data).then(async (zip) => {
  const promises: Promise<unknown>[] = [];
  zip.forEach((relativePath, zipEntry) => {
    if (!relativePath.endsWith('.csv') || relativePath.includes('project_history')) {
      return;
    }
    const promise = new Promise((resolve) => {
      zipEntry.async('nodebuffer').then((content) => {
        const csv = content.toString();
        const result = papaparse.parse(csv, { header: true });
        resolve(result.data);
      });
    });
    promises.push(promise);
  });
  const [tasks] = await Promise.all<
    [PivotalTask[]]
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  >(promises as any);

  const labelsToInsert = getLabels(tasks, project.organizationId, project.id);
  const subtasksToInsert: InsertTaskModel[] = [];
  const tasksToInsert = tasks
    // Filter out accepted tasks
    .filter((task) => task['Current State'] !== 'accepted')
    .map((task, index) => {
      const taskId = nanoid();
      const labelsIds = getTaskLabels(task, labelsToInsert);
      const subtasks = getSubtask(task, taskId, project.organizationId, project.id);
      if (subtasks.length) subtasksToInsert.push(...subtasks);
      return {
        id: taskId,
        summary: `<div class="bn-block-content"><p class="bn-inline-content">${task.Title}</p></div>`,
        type: (task.Type || 'chore') as 'feature' | 'bug' | 'chore',
        organizationId: project.organizationId,
        projectId: project.id,
        expandable: true,
        keywords: task.Description || task.Title ? extractKeywords(task.Description + task.Title) : '',
        impact: ['0', '1', '2', '3'].includes(task.Estimate) ? +task.Estimate : 0,
        description: `<div class="bn-block-content"><p class="bn-inline-content">${task.Title}</p></div><div class="bn-block-content"><p class="bn-inline-content">${task.Description}</p></div>`,
        labels: labelsIds,
        status:
          task['Current State'] === 'accepted'
            ? 6
            : task['Current State'] === 'reviewed'
              ? 5
              : task['Current State'] === 'delivered'
                ? 4
                : task['Current State'] === 'finished'
                  ? 3
                  : task['Current State'] === 'started'
                    ? 2
                    : task['Current State'] === 'unstarted'
                      ? 1
                      : 0,
        order: index,
        createdAt: new Date(),
      } satisfies InsertTaskModel;
    });
  await db.insert(labelsTable).values(labelsToInsert);
  await db.insert(tasksTable).values(tasksToInsert).onConflictDoNothing();
  if (subtasksToInsert.length) await db.insert(tasksTable).values(subtasksToInsert);

  console.info('Done');
  process.exit(0);
});
