import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

export interface RepoLinkOptions {
  /** Absolute path to the repo root; candidate paths are resolved against it. */
  repoRoot: string;
  /** Repo URL without trailing slash, e.g. https://github.com/cellajs/cella. */
  repoUrl: string;
  /** Branch the blob URLs point at. */
  branch?: string;
  /** Repo-relative source documents that have a first-class route in the docs site. */
  docRoutes?: Readonly<Record<string, string>>;
}

/**
 * A repo doc's relative link: a target with a docs route maps to `routeUrl(route)`, any other repo file to its GitHub
 * blob URL. Returns null for a target outside the repo or missing, so no dead link is introduced.
 */
export function relativeRepoLink(
  { repoRoot, repoUrl, branch = 'main', docRoutes = {} }: RepoLinkOptions,
  docDir: string,
  url: string,
  routeUrl = (route: string) => route,
): string | null {
  const [target, hash] = url.split('#');
  const abs = path.resolve(docDir, target);
  const rel = path.relative(repoRoot, abs).replaceAll(path.sep, '/');
  if (rel.startsWith('..') || !existsSync(abs)) return null;
  const suffix = hash ? `#${hash}` : '';
  const docsRoute = docRoutes[rel];
  if (docsRoute) return `${routeUrl(docsRoute)}${suffix}`;
  return `${repoUrl.replace(/\/+$/, '')}/blob/${branch}/${rel}${suffix}`;
}

type MdNode = { type: string; value?: string; url?: string; children?: MdNode[] };

// `dir/file.ext` with a known source extension, optionally `:12` or `:12-20`.
const PATH_RE = /^([\w.][\w./-]*\.(?:tsx?|jsx?|mjs|cjs|json|ya?ml|css|md|sh|toml))(?::(\d+)(?:-(\d+))?)?$/;
// The trailing slash in `dir/` marks an explicit directory reference.
const DIR_RE = /^([\w.][\w./-]*)\/$/;

/** Links verified repository paths in inline code and imported repository-document links. */
export function remarkLinkRepoPaths(options: RepoLinkOptions) {
  const { repoRoot, repoUrl, branch = 'main' } = options;
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

    const walk = (node: MdNode, insideLink: boolean) => {
      const children = node.children;
      if (!children) return;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (docDir && child.type === 'link' && child.url?.startsWith('.')) {
          const url = relativeRepoLink(options, docDir, child.url);
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
