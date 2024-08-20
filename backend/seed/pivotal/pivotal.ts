import fs from 'node:fs';
import { Command } from 'commander';
import { eq } from 'drizzle-orm';
import JSZip from 'jszip';
import papaparse from 'papaparse';
import { db } from '../../src/db/db';
import { tasksTable } from '../../src/db/schema/tasks';
import { projectsTable } from '../../src/db/schema/projects';
import { labelsTable } from '../../src/db/schema/labels';
import { nanoid } from 'nanoid';
import type { PivotalTask, Subtask } from './type';
import { extractKeywords, getLabels, getSubTask, getTaskLabels } from './helper';

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
  const subtasksToInsert: Subtask[] = [];
  const tasksToInsert = tasks.map((task, index) => {
    const taskId = nanoid();
    const labelsIds = getTaskLabels(task, labelsToInsert);
    const subtasks = getSubTask(task, taskId, project.organizationId, project.id);
    if (subtasks.length) subtasksToInsert.push(...subtasks);
    return {
      id: taskId,
      slug: task.Id,
      summary: `<p class="bn-inline-content">${task.Title}</p>` || '<p class="bn-inline-content">No title</p>',
      type: (task.Type || 'chore') as 'feature' | 'bug' | 'chore',
      createdBy: 'pivotal',
      organizationId: project.organizationId,
      projectId: project.id,
      expandable: true,
      keywords: extractKeywords(task.Description.length ? task.Description : task.Title),
      impact: ['0', '1', '2', '3'].includes(task.Estimate) ? +task.Estimate : 0,
      description: `<p class="bn-inline-content">${task.Title}</p><p class="bn-inline-content">${task.Description}</p>`,
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
    };
  });
  await db.insert(labelsTable).values(labelsToInsert);
  await db.insert(tasksTable).values(tasksToInsert).onConflictDoNothing();
  if (subtasksToInsert.length) await db.insert(tasksTable).values(subtasksToInsert);

  console.info('Done');
  process.exit(0);
});
