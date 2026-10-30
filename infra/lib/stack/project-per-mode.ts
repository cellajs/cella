import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ownProjectId, removeModeProjectId, sharedFileProjectId } from '../utils/env-files';
import { infraDir } from '../utils/paths';
import type { Environment } from './bootstrap-stack-state';

/** Every environment a stack can be set up for. */
export const environments: readonly Environment[] = ['production', 'staging'];

/** Where a mode's project id comes from: its stack file, an env file that still names it, the shell, or nowhere. */
export type ProjectIdSource = 'stack-file' | 'env-file' | 'shell' | 'none';

const stackFilePath = (mode: string) => resolve(infraDir, `Pulumi.${mode}.yaml`);

/** The project id a stack file names under `infra:projectId`, in plain text: it is no secret, and every checkout needs it. */
export function stackFileProjectId(yamlText?: string): string | undefined {
  return yamlText?.match(/^\s*infra:projectId:\s*["']?([^"'\s]+)/m)?.[1];
}

/** A stack file's text with `infra:projectId` set: edited as text, as this needs no Pulumi login and keeps every other line. */
function withStackFileProjectId(yamlText: string, projectId: string): string {
  const line = `  infra:projectId: ${projectId}`;
  if (stackFileProjectId(yamlText)) return yamlText.replace(/^\s*infra:projectId:.*$/m, line);
  if (/^config:\s*$/m.test(yamlText)) return yamlText.replace(/^config:\s*$/m, `config:\n${line}`);
  return `${yamlText.trimEnd()}\nconfig:\n${line}\n`;
}

/** Record a mode's project in its stack file, which must exist, and take it out of the mode's env file. */
export function writeStackFileProjectId(mode: string, projectId: string): void {
  const path = stackFilePath(mode);
  const yamlText = readFileSync(path, 'utf8');
  if (stackFileProjectId(yamlText) !== projectId) writeFileSync(path, withStackFileProjectId(yamlText, projectId));
  removeModeProjectId(mode);
}

export interface ProjectInputs {
  /** The id the mode's stack file names. */
  stack?: string;
  /** The id the mode's own env file still names. */
  own?: string;
  /** The id the process env resolves to once the mode file is loaded. */
  resolved?: string;
  /** The id that a file every mode reads names (backend/.env, the repo-root .env). */
  shared?: string;
  /** True when the mode's stack file exists. */
  hasStack: boolean;
}

export interface ProjectResolution {
  /** Empty when the mode has no project yet: its setup asks for one. */
  projectId: string;
  source: ProjectIdSource;
  /** True when the process env holds the shared id and this mode must not use it. */
  dropShared: boolean;
}

/**
 * Decide a mode's project. Every environment has a project of its own, so a mode without a stack never takes the id of a file every mode reads:
 * its setup asks. An existing stack keeps that id until it is written to its stack file. An id exported in the shell is the caller's choice for this run.
 */
export function resolveModeProject(inputs: ProjectInputs): ProjectResolution {
  if (inputs.stack) return { projectId: inputs.stack, source: 'stack-file', dropShared: false };
  if (inputs.own) return { projectId: inputs.own, source: 'env-file', dropShared: false };
  if (!inputs.resolved) return { projectId: '', source: 'none', dropShared: false };
  if (inputs.resolved !== inputs.shared) return { projectId: inputs.resolved, source: 'shell', dropShared: false };
  return inputs.hasStack
    ? { projectId: inputs.resolved, source: 'env-file', dropShared: false }
    : { projectId: '', source: 'none', dropShared: true };
}

/** What `projectsOfOtherModes` reads; a test passes its own. */
export interface ModeProjectReader {
  own(mode: string): string | undefined;
  shared(): string | undefined;
  hasStack(mode: string): boolean;
}

const filesReader: ModeProjectReader = {
  own: (mode) => (existsSync(stackFilePath(mode)) ? stackFileProjectId(readFileSync(stackFilePath(mode), 'utf8')) : undefined) ?? ownProjectId(mode),
  shared: sharedFileProjectId,
  hasStack: (mode) => existsSync(stackFilePath(mode)),
};

/** The project of every other environment that has one, keyed by project id, so an environment is never given another's project. */
export function projectsOfOtherModes(mode: string, read: ModeProjectReader = filesReader): Map<string, Environment> {
  const taken = new Map<string, Environment>();
  for (const other of environments) {
    if (other === mode) continue;
    const id = read.own(other) ?? (read.hasStack(other) ? read.shared() : undefined);
    if (id) taken.set(id, other);
  }
  return taken;
}

export interface ProjectChoice {
  name: string;
  value: string;
  description?: string;
  /** Why the choice cannot be taken; the prompt shows it beside the name. */
  disabled?: string;
}

/** The setup wizard's project list: create one, or take an existing one that no other environment uses. The project named after the slug is the default when it is free. */
export function projectChoices(
  projects: readonly { id: string; name: string }[],
  slug: string,
  taken: ReadonlyMap<string, string>,
  createValue: string,
): { choices: ProjectChoice[]; default: string } {
  const named = projects.find((project) => project.name === slug && !taken.has(project.id));
  return {
    default: named?.id ?? createValue,
    choices: [
      { name: `Create project "${slug}"`, value: createValue, description: 'Creates a fresh project in your organization.' },
      ...projects.map((project) => {
        const usedBy = taken.get(project.id);
        return { name: `${project.name} (${project.id})`, value: project.id, ...(usedBy ? { disabled: `the project of ${usedBy}` } : {}) };
      }),
    ],
  };
}

/** What `status` says about a mode's project: missing, shared with another environment, or its own. */
export function projectVerdict(
  projectId: string | undefined,
  taken: ReadonlyMap<string, string>,
): { status: 'missing' | 'shared' | 'ok'; sharedWith?: string } {
  if (!projectId) return { status: 'missing' };
  const sharedWith = taken.get(projectId);
  return sharedWith ? { status: 'shared', sharedWith } : { status: 'ok' };
}
