import { describe, expect, it } from 'vitest';
import { type ModeProjectReader, projectChoices, projectsOfOtherModes, projectVerdict, resolveModeProject } from './project-per-mode';

const reader = (files: { own?: Record<string, string>; shared?: string; stacks?: string[] }): ModeProjectReader => ({
  own: (mode) => files.own?.[mode],
  shared: () => files.shared,
  hasStack: (mode) => (files.stacks ?? []).includes(mode),
});

describe('resolveModeProject', () => {
  it('takes the stack file over every other source', () => {
    expect(resolveModeProject({ stack: 'stack-1', own: 'own-1', resolved: 'own-1', shared: 'shared-1', hasStack: true })).toEqual({
      projectId: 'stack-1',
      source: 'stack-file',
      dropShared: false,
    });
  });

  it("takes the id of the mode's own file", () => {
    expect(resolveModeProject({ own: 'own-1', resolved: 'own-1', shared: 'shared-1', hasStack: false })).toEqual({
      projectId: 'own-1',
      source: 'env-file',
      dropShared: false,
    });
  });

  it('gives a mode without a stack no project when only a shared file names one, so its setup asks', () => {
    expect(resolveModeProject({ resolved: 'shared-1', shared: 'shared-1', hasStack: false })).toEqual({
      projectId: '',
      source: 'none',
      dropShared: true,
    });
  });

  it('lets an existing stack keep the id of the shared file', () => {
    expect(resolveModeProject({ resolved: 'shared-1', shared: 'shared-1', hasStack: true })).toEqual({
      projectId: 'shared-1',
      source: 'env-file',
      dropShared: false,
    });
  });

  it('honours an id exported in the shell for this run', () => {
    expect(resolveModeProject({ resolved: 'shell-1', shared: 'shared-1', hasStack: false })).toEqual({
      projectId: 'shell-1',
      source: 'shell',
      dropShared: false,
    });
    expect(resolveModeProject({ resolved: 'shell-1', hasStack: false }).source).toBe('shell');
  });

  it('has no project when nothing names one', () => {
    expect(resolveModeProject({ hasStack: true })).toEqual({ projectId: '', source: 'none', dropShared: false });
  });
});

describe('projectsOfOtherModes', () => {
  it("lists another environment's own project", () => {
    expect([...projectsOfOtherModes('staging', reader({ own: { production: 'prod-1', staging: 'stag-1' } }))]).toEqual([['prod-1', 'production']]);
  });

  it('counts the shared file for another environment only when that environment has a stack', () => {
    expect(projectsOfOtherModes('staging', reader({ shared: 'shared-1', stacks: ['production'] })).get('shared-1')).toBe('production');
    expect(projectsOfOtherModes('staging', reader({ shared: 'shared-1' })).size).toBe(0);
  });

  it("prefers the other environment's own file over the shared one", () => {
    expect([
      ...projectsOfOtherModes('staging', reader({ own: { production: 'prod-1' }, shared: 'shared-1', stacks: ['production'] })).keys(),
    ]).toEqual(['prod-1']);
  });
});

describe('projectChoices', () => {
  const projects = [
    { id: 'p-default', name: 'default' },
    { id: 'p-app', name: 'app-staging' },
  ];

  it('offers the project named after the slug as the default when it is free', () => {
    const offered = projectChoices(projects, 'app-staging', new Map(), 'CREATE');
    expect(offered.default).toBe('p-app');
    expect(offered.choices.map((choice) => choice.value)).toEqual(['CREATE', 'p-default', 'p-app']);
    expect(offered.choices.every((choice) => choice.disabled === undefined)).toBe(true);
  });

  it("makes another environment's project untakeable and says whose it is", () => {
    const offered = projectChoices(projects, 'app-staging', new Map([['p-default', 'production']]), 'CREATE');
    expect(offered.choices.find((choice) => choice.value === 'p-default')?.disabled).toBe('the project of production');
  });

  it('defaults to creating a project when the one named after the slug is taken or absent', () => {
    expect(projectChoices(projects, 'app-staging', new Map([['p-app', 'production']]), 'CREATE').default).toBe('CREATE');
    expect(projectChoices(projects, 'other', new Map(), 'CREATE').default).toBe('CREATE');
  });
});

describe('projectVerdict', () => {
  it('names the environment a project is shared with', () => {
    expect(projectVerdict('p-1', new Map([['p-1', 'production']]))).toEqual({ status: 'shared', sharedWith: 'production' });
  });

  it('is ok for a project of its own and missing without one', () => {
    expect(projectVerdict('p-1', new Map([['p-2', 'production']]))).toEqual({ status: 'ok' });
    expect(projectVerdict(undefined, new Map())).toEqual({ status: 'missing' });
  });
});
