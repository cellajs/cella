import fs from 'node:fs';
import { Command } from 'commander';
import { eq } from 'drizzle-orm';
import JSZip from 'jszip';
import papaparse from 'papaparse';
import { db } from '../src/db/db.electric';
import { tasksTable } from '../src/db/schema-electric/tasks';
import { projectsTable } from '../src/db/schema/projects';

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
    [
      {
        Id: string;
        Title: string;
        Type: string;
        Priority: string;
        'Current State': string;
        // Jan 7, 2024
        'Created at': string;
      }[],
    ]
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  >(promises as any);

  await db
    .insert(tasksTable)
    .values(
      tasks.map((task, index) => {
        return {
          slug: task.Id,
          summary: task.Title || 'No title',
          type: (task.Type || 'chore') as 'feature' | 'bug' | 'chore',
          createdBy: 'pivotal',
          organizationId: project.organizationId,
          projectId: project.id,
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
      }),
    )
    .onConflictDoNothing();

  console.info('Done');
  process.exit(0);
});
