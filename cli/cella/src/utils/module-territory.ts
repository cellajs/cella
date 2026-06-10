/**
 * Static analysis of module ownership for sync CLI.
 *
 * Each module declares ownership via a `registerModule({ owner, ... })` call in
 * its `*-module.ts` file. Modules with `owner: 'app'` are fork-specific: their
 * folders are fork territory and must never be added, modified, or deleted by
 * upstream during sync — nor offered back upstream by the contributions service.
 *
 * Parsing is syntax-only (no type-checker), so it is fast and tolerant of
 * formatting, comments, and property order. Built on ts-morph so the same
 * project/AST approach can be reused for other source-introspection tasks.
 */

import { relative, sep } from 'node:path';
import { Project, SyntaxKind } from 'ts-morph';

/** Glob patterns (relative to repo root) for module definition files. */
const MODULE_FILE_GLOBS = ['backend/src/modules/*/*-module.ts', 'frontend/src/modules/*/*-module.ts'];

/**
 * Read the string value of an object literal's `owner` property, if present.
 */
function readOwner(call: import('ts-morph').CallExpression): string | undefined {
  const arg = call.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression);
  const initializer = arg?.getProperty('owner')?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  return initializer?.asKind(SyntaxKind.StringLiteral)?.getLiteralValue();
}

/**
 * Scan a repository for module folders owned by the app (`owner: 'app'`).
 *
 * @param repoPath - Absolute path to the repository root to scan.
 * @returns Repo-relative folder paths (POSIX separators), deduplicated.
 */
export function resolveAppModuleFolders(repoPath: string): string[] {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
  });

  const sourceFiles = project.addSourceFilesAtPaths(MODULE_FILE_GLOBS.map((glob) => `${repoPath}/${glob}`));

  const folders = new Set<string>();

  for (const sourceFile of sourceFiles) {
    const ownsApp = sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .some((call) => call.getExpression().getText() === 'registerModule' && readOwner(call) === 'app');

    if (!ownsApp) continue;

    const folder = relative(repoPath, sourceFile.getDirectoryPath()).split(sep).join('/');
    folders.add(folder);
  }

  return [...folders];
}
