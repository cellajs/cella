import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Remark plugin: turn inline code that names a repo file into a link to that file on
 * GitHub. `` `backend/src/server.ts` `` -> a link to the blob URL, with an optional
 * `:line` / `:line-line` suffix mapped to `#L..`. A trailing slash marks a directory
 * reference (`` `frontend/src/query/` ``) and links to the tree URL. Only
 * paths that resolve to a real file or directory (checked against the repo root at
 * build time) are linked, so dead links can't be introduced and ambiguous bare names
 * (e.g. `index.ts`) stay plain code.
 *
 * Also rewrites relative markdown links (`[x](../shared/...)`) inside imported repo
 * docs to GitHub blob URLs. In the SPA they would otherwise resolve as
 * broken routes. Content-root pages are left untouched.
 *
 * Runs at the mdast stage (before rehype), so it applies to content/docs pages and the
 * repo docs they import alike. Dependency-free: a manual walk avoids pulling in
 * unist-util-visit for one visitor.
 */

interface Options {
  /** Absolute path to the repo root; candidate paths are resolved against it. */
  repoRoot: string;
  /** Repo URL without trailing slash, e.g. https://github.com/cellajs/cella. */
  repoUrl: string;
  /** Branch the blob URLs point at. */
  branch?: string;
}

type MdNode = { type: string; value?: string; url?: string; children?: MdNode[] };

// `dir/file.ext` with a known source extension, optionally `:12` or `:12-20`.
const PATH_RE = /^([\w.][\w./-]*\.(?:tsx?|jsx?|mjs|cjs|json|ya?ml|css|md|sh|toml))(?::(\d+)(?:-(\d+))?)?$/;
// The trailing slash in `dir/` marks an explicit directory reference.
const DIR_RE = /^([\w.][\w./-]*)\/$/;

export function remarkLinkRepoPaths({ repoRoot, repoUrl, branch = 'main' }: Options) {
  const root = repoUrl.replace(/\/+$/, '');
  const base = `${root}/blob/${branch}/`;

  // Stay inside the repo; reject traversal/absolute paths before touching the fs.
  const escapesRepo = (p: string) => p.startsWith('/') || p.split('/').includes('..');

  const linkFor = (value: string): string | null => {
    const match = PATH_RE.exec(value);
    if (match) {
      const [, filePath, startLine, endLine] = match;
      if (escapesRepo(filePath) || !existsSync(path.join(repoRoot, filePath))) return null;
      const hash = startLine ? `#L${startLine}${endLine ? `-L${endLine}` : ''}` : '';
      return `${base}${filePath}${hash}`;
    }
    const dir = DIR_RE.exec(value)?.[1];
    if (dir && !escapesRepo(dir) && statSync(path.join(repoRoot, dir), { throwIfNoEntry: false })?.isDirectory()) {
      return `${root}/tree/${branch}/${dir}`;
    }
    return null;
  };

  return (tree: MdNode, file?: { path?: string }) => {
    // Repo docs (imported from outside the content root) carry repo-relative markdown links that
    // would render as broken SPA routes, so point them at GitHub. Content-root pages keep their links
    // (authors there use absolute /docs/... or external URLs).
    const docDir = file?.path && !file.path.includes('/src/content/docs/') ? path.dirname(file.path) : null;

    const relativeLinkFor = (url: string): string | null => {
      if (!docDir) return null;
      const [target, hash] = url.split('#');
      const abs = path.resolve(docDir, target);
      const rel = path.relative(repoRoot, abs).replaceAll(path.sep, '/');
      // Stay inside the repo and never introduce a dead link.
      if (rel.startsWith('..') || !existsSync(abs)) return null;
      return `${base}${rel}${hash ? `#${hash}` : ''}`;
    };

    const walk = (node: MdNode, insideLink: boolean) => {
      const children = node.children;
      if (!children) return;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (docDir && child.type === 'link' && child.url?.startsWith('.')) {
          const url = relativeLinkFor(child.url);
          if (url) child.url = url;
        }
        // Don't re-link code that already sits inside a link.
        if (!insideLink && child.type === 'inlineCode' && typeof child.value === 'string') {
          const url = linkFor(child.value);
          if (url) {
            children[i] = { type: 'link', url, children: [child] };
            continue;
          }
        }
        walk(child, insideLink || child.type === 'link');
      }
    };
    walk(tree, false);
  };
}
