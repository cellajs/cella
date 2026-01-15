import pc from 'picocolors';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface OutdatedPackage {
  current: string;
  latest: string;
  wanted: string;
  isDeprecated: boolean;
  dependencyType: 'dependencies' | 'devDependencies';
  dependentPackages: Array<{ name: string; location: string }>;
}

export interface NpmRegistryData {
  repository?: { type: string; url: string; directory?: string };
  homepage?: string;
  bugs?: { url: string };
}

export interface CachedPackageData {
  repoUrl: string | null;
  changelogUrl: string | null;
  fetchedAt: number;
}

export interface ChangelogCache {
  [packageName: string]: CachedPackageData;
}

export interface EnhancedPackageInfo {
  name: string;
  current: string;
  latest: string;
  dependents: string;
  dependentLocations: string[];
  isDev: boolean;
  isMajorUpdate: boolean;
  repoUrl: string | null;
  changelogUrl: string | null;
  releasesUrl: string | null;
}

// Cache file location (in cli/sync directory)
export const CACHE_FILE = path.join(import.meta.dirname, '..', '.outdated.cache.json');
export const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

/**
 * Loads the changelog cache from disk.
 */
export function loadCache(): ChangelogCache {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    }
  } catch {
    // Ignore cache read errors
  }
  return {};
}

/**
 * Saves the changelog cache to disk.
 */
export function saveCache(cache: ChangelogCache): void {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // Ignore cache write errors
  }
}

/**
 * Clears the changelog cache.
 */
export function clearCache(): void {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
      console.info(pc.green('✓ Cache cleared successfully'));
    } else {
      console.info(pc.yellow('No cache file found'));
    }
  } catch (err) {
    console.error(pc.red('Failed to clear cache:'), err);
  }
}

/**
 * Fetches package metadata from npm registry.
 */
export async function fetchNpmMetadata(packageName: string): Promise<NpmRegistryData | null> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}`);
    if (!response.ok) return null;
    return (await response.json()) as NpmRegistryData;
  } catch {
    return null;
  }
}

/**
 * Extracts GitHub repo URL from npm registry data.
 * Normalizes git+https:// URLs to https:// format.
 */
export function getRepoUrl(data: NpmRegistryData | null): string | null {
  if (!data?.repository?.url) return null;

  let url = data.repository.url;

  // Normalize git+https:// to https://
  if (url.startsWith('git+')) {
    url = url.slice(4);
  }

  // Remove .git suffix
  if (url.endsWith('.git')) {
    url = url.slice(0, -4);
  }

  // Convert git:// to https://
  if (url.startsWith('git://')) {
    url = url.replace('git://', 'https://');
  }

  return url;
}

/**
 * Common changelog file paths to check in GitHub repos.
 */
export const CHANGELOG_PATHS = [
  'CHANGELOG.md',
  'CHANGELOG',
  'changelog.md',
  'HISTORY.md',
  'CHANGES.md',
  'NEWS.md',
];

/** Default branches to check for changelog files. */
export const DEFAULT_BRANCHES = ['main', 'master'] as const;

/**
 * Checks if a file exists in a GitHub repo and returns the branch name if found.
 * Returns null if file doesn't exist on any branch.
 */
export async function findGitHubFile(repoUrl: string, filePath: string): Promise<string | null> {
  if (!repoUrl.includes('github.com')) return null;

  for (const branch of DEFAULT_BRANCHES) {
    const rawUrl = repoUrl
      .replace('github.com', 'raw.githubusercontent.com')
      .concat(`/${branch}/${filePath}`);

    try {
      const response = await fetch(rawUrl, { method: 'HEAD' });
      if (response.ok) return branch;
    } catch {
      // Continue to next branch
    }
  }
  return null;
}

/**
 * Finds the changelog URL for a package by checking common locations.
 * Results are cached to avoid repeated GitHub requests.
 */
export async function findChangelogUrl(
  repoUrl: string | null,
  packageName: string,
  cache: ChangelogCache
): Promise<string | null> {
  if (!repoUrl || !repoUrl.includes('github.com')) return null;

  // Check cache first
  const cached = cache[packageName];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.changelogUrl;
  }

  // Try each common changelog path - findGitHubFile returns branch if found
  for (const changelogPath of CHANGELOG_PATHS) {
    const branch = await findGitHubFile(repoUrl, changelogPath);
    if (branch) {
      const blobUrl = `${repoUrl}/blob/${branch}/${changelogPath}`;
      // Cache the result
      cache[packageName] = {
        repoUrl,
        changelogUrl: blobUrl,
        fetchedAt: Date.now(),
      };
      return blobUrl;
    }
  }

  // No changelog found, cache negative result
  cache[packageName] = {
    repoUrl,
    changelogUrl: null,
    fetchedAt: Date.now(),
  };

  return null;
}

/**
 * Get GitHub releases URL
 */
export function getReleasesUrl(repoUrl: string | null): string | null {
  if (!repoUrl || !repoUrl.includes('github.com')) return null;
  return `${repoUrl}/releases`;
}

/**
 * Checks if the update is a major version change.
 */
export function isMajorVersionChange(current: string, latest: string): boolean {
  const currentMajor = current.split('.')[0]?.replace(/^\D+/, '');
  const latestMajor = latest.split('.')[0]?.replace(/^\D+/, '');
  if (!currentMajor || !latestMajor) return false;
  return Number.parseInt(latestMajor, 10) > Number.parseInt(currentMajor, 10);
}

/**
 * Runs pnpm outdated and returns JSON output.
 * Note: pnpm outdated exits with code 1 when packages are outdated,
 * so we need to handle this as a normal case, not an error.
 */
export function getOutdatedPackages(): Record<string, OutdatedPackage> {
  try {
    // Use spawnSync to get both stdout and handle non-zero exit codes properly
    const result = execSync('pnpm -r outdated --json 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
    });
    
    if (!result || result.trim() === '') {
      return {};
    }
    
    return JSON.parse(result);
  } catch (error) {
    // pnpm outdated exits with code 1 when there are outdated packages
    // This is expected behavior, not an error
    if (error instanceof Error && 'stdout' in error) {
      const stdout = (error as { stdout: string }).stdout;
      if (stdout && stdout.trim()) {
        try {
          return JSON.parse(stdout);
        } catch {
          // JSON parse failed, return empty
          return {};
        }
      }
    }
    return {};
  }
}

/**
 * Formats a clickable terminal link (OSC 8 escape sequence).
 * Falls back to plain text if terminal doesn't support it.
 */
export function terminalLink(text: string, url: string): string {
  // OSC 8 hyperlink format: \e]8;;URL\e\\TEXT\e]8;;\e\\
  return `\u001B]8;;${url}\u0007${text}\u001B]8;;\u0007`;
}

/**
 * Main function to check outdated packages with enhanced output.
 */
export async function runOutdated(clearCacheFlag = false) {
  // Handle cache clearing
  if (clearCacheFlag) {
    clearCache();
    return;
  }

  console.info(pc.cyan('\n📦 Checking for outdated packages...\n'));

  const outdatedPackages = getOutdatedPackages();
  const packageNames = Object.keys(outdatedPackages);

  if (packageNames.length === 0) {
    console.info(pc.green('✓ All packages are up to date!'));
    return;
  }

  // Load cache for changelog URLs
  const cache = loadCache();
  const uncachedCount = packageNames.filter((name) => {
    const cached = cache[name];
    return !cached || Date.now() - cached.fetchedAt >= CACHE_TTL;
  }).length;

  const cacheInfo = uncachedCount > 0 ? ` (${uncachedCount} uncached)` : ' (all cached)';
  console.info(pc.yellow(`Found ${packageNames.length} outdated package(s).${cacheInfo} Fetching metadata...\n`));

  // Pre-cache package.json reads for dependent names
  const dependentNameCache = new Map<string, string>();
  for (const name of packageNames) {
    for (const dep of outdatedPackages[name].dependentPackages) {
      if (!dependentNameCache.has(dep.location)) {
        const packageJsonPath = path.join(dep.location, 'package.json');
        try {
          const pkgJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
          dependentNameCache.set(dep.location, (pkgJson.name || path.basename(dep.location)).replace('@cella/', ''));
        } catch {
          dependentNameCache.set(dep.location, path.basename(dep.location));
        }
      }
    }
  }

  // Fetch metadata for all packages in parallel (with concurrency limit)
  const enhancedPackages: EnhancedPackageInfo[] = [];
  const batchSize = 10;

  for (let i = 0; i < packageNames.length; i += batchSize) {
    const batch = packageNames.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (name) => {
        const pkg = outdatedPackages[name];
        const metadata = await fetchNpmMetadata(name);
        const repoUrl = getRepoUrl(metadata);
        const changelogUrl = await findChangelogUrl(repoUrl, name, cache);

        return {
          name,
          current: pkg.current,
          latest: pkg.latest,
          dependents: pkg.dependentPackages.map((d) => d.name.replace('@cella/', '')).join(', '),
          dependentLocations: pkg.dependentPackages.map((d) => d.location),
          isDev: pkg.dependencyType === 'devDependencies',
          isMajorUpdate: isMajorVersionChange(pkg.current, pkg.latest),
          repoUrl,
          changelogUrl,
          releasesUrl: getReleasesUrl(repoUrl),
        };
      })
    );
    enhancedPackages.push(...results);
  }

  // Save updated cache
  saveCache(cache);

  // Sort: by dependents (primary), then alphabetically (secondary)
  enhancedPackages.sort((a, b) => {
    const depCompare = a.dependents.localeCompare(b.dependents);
    if (depCompare !== 0) return depCompare;
    return a.name.localeCompare(b.name);
  });

  // Print enhanced table
  console.info(pc.bold('Outdated Packages:\n'));

  // Calculate column widths (include dev tag in name width calculation)
  const DEV_TAG = ' (dev)';
  const maxNameLen = Math.max(
    ...enhancedPackages.map((p) => p.name.length + (p.isDev ? DEV_TAG.length : 0)),
    7
  );
  const maxCurrentLen = Math.max(...enhancedPackages.map((p) => p.current.length), 7);
  const maxLatestLen = Math.max(...enhancedPackages.map((p) => p.latest.length), 6);
  const maxDependentsLen = Math.max(...enhancedPackages.map((p) => p.dependents.length), 10);

  // Header
  const header = [
    pc.bold('Package'.padEnd(maxNameLen)),
    pc.bold('Current'.padEnd(maxCurrentLen)),
    pc.bold('Latest'.padEnd(maxLatestLen)),
    pc.bold('Dependents'.padEnd(maxDependentsLen)),
    pc.bold('Links'),
  ].join('  │  ');

  console.info(header);
  console.info('─'.repeat(header.length + 20));

  // Rows
  for (const pkg of enhancedPackages) {
    const displayName = pkg.isDev ? `${pkg.name}${DEV_TAG}` : pkg.name;
    const name = pc.white(displayName.padEnd(maxNameLen));
    const current = pc.red(pkg.current.padEnd(maxCurrentLen));
    // Bold major updates
    const latestText = pkg.latest.padEnd(maxLatestLen);
    const latest = pkg.isMajorUpdate ? pc.bold(pc.green(latestText)) : pc.green(latestText);
    const dependents = pc.dim(pkg.dependents.padEnd(maxDependentsLen));

    // Build links
    const links: string[] = [];
    if (pkg.changelogUrl) {
      links.push(terminalLink(pc.magenta('changelog'), pkg.changelogUrl));
    }
    if (pkg.releasesUrl) {
      links.push(terminalLink(pc.blue('releases'), pkg.releasesUrl));
    }
    if (pkg.repoUrl) {
      links.push(terminalLink(pc.cyan('repo'), pkg.repoUrl));
    }

    const linksStr = links.length > 0 ? links.join(' ') : pc.dim('n/a');

    console.info(`${name}  │  ${current}  │  ${latest}  │  ${dependents}  │  ${linksStr}`);
  }

  // Summary
  const prodCount = enhancedPackages.filter((p) => !p.isDev).length;
  const devCount = enhancedPackages.filter((p) => p.isDev).length;
  const majorCount = enhancedPackages.filter((p) => p.isMajorUpdate).length;

  console.info('\n' + '─'.repeat(60));
  console.info(
    pc.bold('Summary: ') +
    `${prodCount} production` +
    pc.dim(' + ') +
    `${devCount} dev` +
    pc.dim(' dependencies need updates') +
    (majorCount > 0 ? pc.dim(' (') + pc.bold(pc.green(`${majorCount} major`)) + pc.dim(')') : '')
  );

  // Package.json links with counts by dependent name
  console.info(pc.bold('\nPackages by dependent:'));
  // Build map of dependent name -> { location, count } using pre-cached names
  const dependentMap = new Map<string, { location: string; count: number }>();
  for (const pkg of enhancedPackages) {
    for (const loc of pkg.dependentLocations) {
      const dependentName = dependentNameCache.get(loc) || path.basename(loc);
      const existing = dependentMap.get(dependentName);
      if (existing) {
        existing.count++;
      } else {
        dependentMap.set(dependentName, { location: loc, count: 1 });
      }
    }
  }
  const sortedDependents = [...dependentMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  // Calculate max dependent name length for alignment
  const maxDependentNameLen = Math.max(...sortedDependents.map(([name]) => name.length));
  for (const [dependentName, { location, count }] of sortedDependents) {
    const packageJsonPath = path.join(location, 'package.json');
    const relativePath = path.relative(process.cwd(), packageJsonPath);
    const paddedName = dependentName.padEnd(maxDependentNameLen);
    console.info(`  ${pc.dim('•')} ${paddedName}  ${terminalLink(pc.cyan(relativePath), `file://${packageJsonPath}`)} ${pc.dim(`(${count})`)}`);
  }

  console.info(pc.dim(`\nTip: Use --refresh to re-fetch changelog locations\n`));
}

// Allow direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const shouldClearCache = args.includes('--refresh');
  runOutdated(shouldClearCache).catch(console.error);
}
