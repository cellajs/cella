import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Remark plugin: turn inline code that names a repo file into a link to that file on
 * GitHub. `` `backend/src/server.ts` `` → a link to the blob URL, with an optional
 * `:line` / `:line-line` suffix mapped to `#L..`. Only paths that resolve to a real
 * file (checked against the repo root at build time) are linked, so dead links can't
 * be introduced and ambiguous bare names (e.g. `index.ts`) stay plain code.
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

export function remarkLinkRepoPaths({ repoRoot, repoUrl, branch = 'main' }: Options) {
  const base = `${repoUrl.replace(/\/+$/, '')}/blob/${branch}/`;

  const linkFor = (value: string): string | null => {
    const match = PATH_RE.exec(value);
    if (!match) return null;
    const [, filePath, startLine, endLine] = match;
    // Stay inside the repo — reject traversal/absolute paths before touching the fs.
    if (filePath.startsWith('/') || filePath.split('/').includes('..')) return null;
    if (!existsSync(path.join(repoRoot, filePath))) return null;
    const hash = startLine ? `#L${startLine}${endLine ? `-L${endLine}` : ''}` : '';
    return `${base}${filePath}${hash}`;
  };

  return (tree: MdNode) => {
    const walk = (node: MdNode, insideLink: boolean) => {
      const children = node.children;
      if (!children) return;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
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
