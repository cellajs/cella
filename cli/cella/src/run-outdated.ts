import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ora from 'ora';
import pc from 'picocolors';

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
  dependents: string[];
  dependentLocations: string[];
  isDev: boolean;
  isMajorUpdate: boolean;
  repoUrl: string | null;
  changelogUrl: string | null;
  releasesUrl: string | null;
  vulnerabilities: VulnerabilityInfo[];
}

/** Vulnerability severity levels */
export type VulnerabilitySeverity = 'critical' | 'high' | 'moderate' | 'low' | 'info';

/** Vulnerability info for a package */
export interface VulnerabilityInfo {
  id: number;
  title: string;
  severity: VulnerabilitySeverity;
  url: string;
  vulnerableVersions: string;
  patchedVersions: string;
  cves: string[];
  /** The workspace/dependent containing this vulnerability (e.g., 'frontend', 'backend') */
  workspace: string | null;
  /** The direct dependency in the workspace that brought in this vulnerable package */
  directDependency: string | null;
}

/** Audit result from pnpm audit --json */
export interface AuditResult {
  advisories: Record<string, AuditAdvisory>;
  metadata: {
    vulnerabilities: Record<VulnerabilitySeverity, number>;
    dependencies: number;
    devDependencies: number;
  };
}

export interface AuditAdvisory {
  id: number;
  title: string;
  module_name: string;
  severity: VulnerabilitySeverity;
  vulnerable_versions: string;
  patched_versions: string;
  cves: string[];
  url: string;
  findings: Array<{ version: string; paths: string[] }>;
}

// Cache file location (in cli/cella directory)
export const CACHE_FILE = path.join(import.meta.dirname, '.outdated.cache.json');
export const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

/**
 * Find monorepo root by looking for pnpm-workspace.yaml, starting from cli/cella directory.
 */
function findMonorepoRoot(): string {
  let dir = import.meta.dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  // Fallback to process.cwd() if not found
  return process.cwd();
}

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
      console.info(pc.green('✓ cache cleared successfully'));
    } else {
      console.info(pc.yellow('no cache file found'));
    }
  } catch (err) {
    console.error(pc.red('failed to clear cache:'), err);
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
export const CHANGELOG_PATHS = ['CHANGELOG.md', 'CHANGELOG', 'changelog.md', 'HISTORY.md', 'CHANGES.md', 'NEWS.md'];

/** Default branches to check for changelog files. */
export const DEFAULT_BRANCHES = ['main', 'master'] as const;

/**
 * Checks whether the provided URL points to a GitHub repository.
 */
function isGitHubRepoUrl(repoUrl: string | null): repoUrl is string {
  if (!repoUrl) return false;
  try {
    const parsed = new URL(repoUrl);
    return parsed.hostname === 'github.com' || parsed.hostname === 'www.github.com';
  } catch {
    return false;
  }
}

/**
 * Checks if a file exists in a GitHub repo and returns the branch name if found.
 * Returns null if file doesn't exist on any branch.
 */
export async function findGitHubFile(repoUrl: string, filePath: string): Promise<string | null> {
  if (!isGitHubRepoUrl(repoUrl)) return null;

  for (const branch of DEFAULT_BRANCHES) {
    const rawUrl = repoUrl.replace('github.com', 'raw.githubusercontent.com').concat(`/${branch}/${filePath}`);

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
  cache: ChangelogCache,
): Promise<string | null> {
  if (!isGitHubRepoUrl(repoUrl)) return null;

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
  if (!isGitHubRepoUrl(repoUrl)) return null;
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
 * Runs pnpm audit and returns parsed JSON output.
 * Returns null if audit fails or no vulnerabilities found.
 */
export function runAudit(): AuditResult | null {
  try {
    const result = execSync('pnpm audit --json 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });

    if (!result || result.trim() === '') {
      return null;
    }

    return JSON.parse(result) as AuditResult;
  } catch (error) {
    // pnpm audit exits with non-zero when vulnerabilities found
    if (error instanceof Error && 'stdout' in error) {
      const stdout = (error as { stdout: string }).stdout;
      if (stdout && stdout.trim()) {
        try {
          return JSON.parse(stdout) as AuditResult;
        } catch {
          return null;
        }
      }
    }
    return null;
  }
}

/** Parsed dependency path info from pnpm audit */
export interface DependencyPathInfo {
  /** The workspace name (e.g., 'frontend', 'backend') */
  workspace: string | null;
  /** The direct dependency in the workspace that starts the chain */
  directDependency: string | null;
}

/**
 * Parses vulnerability paths to extract workspace and direct dependency.
 * Path format is like "workspace>direct-dep>transitive>vulnerable-pkg".
 * Examples:
 *   - "frontend>virtua>solid-js>seroval" -> { workspace: 'frontend', directDependency: 'virtua' }
 *   - "backend>jsx-email>esbuild" -> { workspace: 'backend', directDependency: 'jsx-email' }
 *   - "esbuild" (direct) -> { workspace: null, directDependency: null }
 */
export function parseDependencyPath(paths: string[]): DependencyPathInfo {
  for (const pathStr of paths) {
    const parts = pathStr.split('>');
    if (parts.length >= 2) {
      // First part is workspace, second is the direct dependency in that workspace
      return {
        workspace: parts[0],
        directDependency: parts.length > 2 ? parts[1] : null,
      };
    }
  }
  return { workspace: null, directDependency: null };
}

/**
 * Creates a map of package name -> vulnerabilities from audit result.
 */
export function buildVulnerabilityMap(auditResult: AuditResult | null): Map<string, VulnerabilityInfo[]> {
  const map = new Map<string, VulnerabilityInfo[]>();
  if (!auditResult?.advisories) return map;

  for (const advisory of Object.values(auditResult.advisories)) {
    // Extract workspace and direct dependency from findings paths
    const allPaths = advisory.findings?.flatMap((f) => f.paths) || [];
    const { workspace, directDependency } = parseDependencyPath(allPaths);

    const existing = map.get(advisory.module_name) || [];
    existing.push({
      id: advisory.id,
      title: advisory.title,
      severity: advisory.severity,
      url: advisory.url,
      vulnerableVersions: advisory.vulnerable_versions,
      patchedVersions: advisory.patched_versions,
      cves: advisory.cves || [],
      workspace,
      directDependency,
    });
    map.set(advisory.module_name, existing);
  }

  return map;
}

/**
 * Gets vulnerability severity icon with color.
 */
export function getVulnIcon(severity: VulnerabilitySeverity): string {
  switch (severity) {
    case 'critical':
      return pc.red('●');
    case 'high':
      return pc.red('●');
    case 'moderate':
      return pc.yellow('●');
    case 'low':
      return pc.blue('●');
    default:
      return pc.gray('●');
  }
}

/**
 * Gets the highest severity from a list of vulnerabilities.
 */
export function getHighestSeverity(vulns: VulnerabilityInfo[]): VulnerabilitySeverity | null {
  if (vulns.length === 0) return null;
  const order: VulnerabilitySeverity[] = ['critical', 'high', 'moderate', 'low', 'info'];
  for (const severity of order) {
    if (vulns.some((v) => v.severity === severity)) return severity;
  }
  return null;
}

/**
 * Truncates a string in the middle if it exceeds maxLen.
 * Example: "very-long-package-name" -> "very-lo…e-name"
 */
export function middleTruncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const ellipsis = '…';
  const charsToShow = maxLen - ellipsis.length;
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);
  return str.slice(0, frontChars) + ellipsis + str.slice(-backChars);
}

/**
 * Formats dependents as "first +N" if multiple.
 */
export function formatDependents(dependents: string[]): string {
  if (dependents.length === 0) return '';
  if (dependents.length === 1) return dependents[0];
  return `${dependents[0]} +${dependents.length - 1}`;
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

  // ora auto-detects CI/non-TTY and uses isSilent in test environments
  const isTestEnv = !!process.env.VITEST || process.env.NODE_ENV === 'test';
  const spinner = ora({ text: 'checking for outdated packages & vulnerabilities...', isSilent: isTestEnv });
  spinner.start();

  // Run outdated check and audit in parallel
  const [outdatedPackages, auditResult] = await Promise.all([
    Promise.resolve(getOutdatedPackages()),
    Promise.resolve(runAudit()),
  ]);

  const packageNames = Object.keys(outdatedPackages);
  const vulnMap = buildVulnerabilityMap(auditResult);

  if (packageNames.length === 0 && vulnMap.size === 0) {
    spinner.stop();
    console.info(pc.green('✓ all packages are up to date and secure'));
    return;
  }

  // Load cache for changelog URLs
  const cache = loadCache();

  spinner.text = `found ${packageNames.length} outdated package(s) - fetching metadata...`;

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
          dependents: pkg.dependentPackages.map((d) => d.name.replace('@cella/', '')),
          dependentLocations: pkg.dependentPackages.map((d) => d.location),
          isDev: pkg.dependencyType === 'devDependencies',
          isMajorUpdate: isMajorVersionChange(pkg.current, pkg.latest),
          repoUrl,
          changelogUrl,
          releasesUrl: getReleasesUrl(repoUrl),
          vulnerabilities: vulnMap.get(name) || [],
        };
      }),
    );
    enhancedPackages.push(...results);
  }

  // Save updated cache
  saveCache(cache);

  // Sort: by dependents (primary), then alphabetically (secondary)
  enhancedPackages.sort((a, b) => {
    const depA = formatDependents(a.dependents);
    const depB = formatDependents(b.dependents);
    const depCompare = depA.localeCompare(depB);
    if (depCompare !== 0) return depCompare;
    return a.name.localeCompare(b.name);
  });

  // Stop spinner and print results
  spinner.stop();

  // Calculate counts for summary
  const prodCount = enhancedPackages.filter((p) => !p.isDev).length;
  const devCount = enhancedPackages.filter((p) => p.isDev).length;
  const majorCount = enhancedPackages.filter((p) => p.isMajorUpdate).length;
  const vulnCount = enhancedPackages.filter((p) => p.vulnerabilities.length > 0).length;

  console.info(
    `${prodCount} production` +
      pc.dim(' + ') +
      `${devCount} dev` +
      pc.dim(' dependencies need updates') +
      (majorCount > 0 ? pc.dim(' (') + pc.bold(pc.green(`${majorCount} major`)) + pc.dim(')') : '') +
      (vulnCount > 0 ? pc.dim(' (') + pc.bold(pc.red(`${vulnCount} vulnerable`)) + pc.dim(')') : ''),
  );
  console.info();

  // Calculate column widths
  const DEV_TAG = ' (dev)';
  const MAX_NAME_LEN = 35;
  const MAX_DEPENDENTS_LEN = 15;
  const maxNameLen = Math.min(
    MAX_NAME_LEN,
    Math.max(...enhancedPackages.map((p) => p.name.length + (p.isDev ? DEV_TAG.length : 0)), 7),
  );
  const maxCurrentLen = Math.max(...enhancedPackages.map((p) => p.current.length), 7);
  const maxLatestLen = Math.max(...enhancedPackages.map((p) => p.latest.length), 6);
  const maxDependentsLen = Math.min(
    MAX_DEPENDENTS_LEN,
    Math.max(...enhancedPackages.map((p) => formatDependents(p.dependents).length), 10),
  );

  // Header (vuln column is just a dot, so minimal width)
  const header = [
    ' ',
    pc.bold('package'.padEnd(maxNameLen)),
    pc.bold('current'.padEnd(maxCurrentLen)),
    pc.bold('latest'.padEnd(maxLatestLen)),
    pc.bold('in'.padEnd(maxDependentsLen)),
    pc.bold('links'),
  ].join(' ');

  console.info(header);

  // Rows
  for (const pkg of enhancedPackages) {
    // Vulnerability indicator
    const highestSeverity = getHighestSeverity(pkg.vulnerabilities);
    const vulnIndicator = highestSeverity ? getVulnIcon(highestSeverity) : ' ';

    // Package name (with dev tag, truncated if needed)
    const fullName = pkg.isDev ? `${pkg.name}${DEV_TAG}` : pkg.name;
    const displayName = middleTruncate(fullName, maxNameLen);
    const name = pc.white(displayName.padEnd(maxNameLen));

    // Version columns
    const current = pc.red(pkg.current.padEnd(maxCurrentLen));
    const latestText = pkg.latest.padEnd(maxLatestLen);
    const latest = pkg.isMajorUpdate ? pc.bold(pc.green(latestText)) : pc.green(latestText);

    // Dependents (compact format)
    const dependentsText = formatDependents(pkg.dependents);
    const dependents = pc.dim(middleTruncate(dependentsText, maxDependentsLen).padEnd(maxDependentsLen));

    // Build links (compact)
    const links: string[] = [];
    if (pkg.changelogUrl) {
      links.push(terminalLink(pc.magenta('log'), pkg.changelogUrl));
    }
    if (pkg.releasesUrl) {
      links.push(terminalLink(pc.blue('rel'), pkg.releasesUrl));
    }
    if (pkg.repoUrl) {
      links.push(terminalLink(pc.cyan('repo'), pkg.repoUrl));
    }

    const linksStr = links.length > 0 ? links.join(' ') : pc.dim('n/a');

    console.info(`${vulnIndicator} ${name} ${current} ${latest} ${dependents} ${linksStr}`);
  }

  // Package.json links with counts by dependent name
  console.info();
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
  const monorepoRoot = findMonorepoRoot();
  for (const [dependentName, { location, count }] of sortedDependents) {
    const packageJsonPath = path.join(location, 'package.json');
    const relativePath = path.relative(monorepoRoot, packageJsonPath);
    const paddedName = dependentName.padEnd(maxDependentNameLen);
    console.info(
      `  ${pc.dim('•')} ${paddedName}  ${terminalLink(pc.cyan(relativePath), `file://${packageJsonPath}`)} ${pc.dim(`${count}`)}`,
    );
  }

  // Vulnerability summary section
  if (auditResult && vulnMap.size > 0) {
    const vulnMeta = auditResult.metadata?.vulnerabilities || {};
    const criticalCount = vulnMeta.critical || 0;
    const highCount = vulnMeta.high || 0;
    const moderateCount = vulnMeta.moderate || 0;
    const lowCount = vulnMeta.low || 0;
    const totalVulns = criticalCount + highCount + moderateCount + lowCount;

    console.info();
    console.info(
      `${pc.red('⚠')} ${pc.bold('vulnerabilities')} ${pc.dim('·')} ` +
        (criticalCount > 0 ? pc.red(`${criticalCount} critical `) : '') +
        (highCount > 0 ? pc.red(`${highCount} high `) : '') +
        (moderateCount > 0 ? pc.yellow(`${moderateCount} moderate `) : '') +
        (lowCount > 0 ? pc.blue(`${lowCount} low`) : ''),
    );
    console.info('─'.repeat(60));

    // List vulnerable packages with details
    for (const [pkgName, vulns] of vulnMap.entries()) {
      for (const vuln of vulns) {
        const severityIcon = getVulnIcon(vuln.severity);
        const cveStr = vuln.cves.length > 0 ? pc.dim(` ${vuln.cves[0]}`) : '';
        // Build source info: "in workspace via direct-dep" or just "in workspace"
        let sourceStr = '';
        if (vuln.workspace) {
          sourceStr = pc.dim(` in ${vuln.workspace}`);
          if (vuln.directDependency) {
            sourceStr += pc.dim(` via ${vuln.directDependency}`);
          }
        }
        const title = middleTruncate(vuln.title, 60);
        console.info(
          `${severityIcon} ${pc.white(pkgName)} ${pc.dim(vuln.vulnerableVersions)}${sourceStr} ${pc.dim('·')} ${title}${cveStr}`,
        );
      }
    }

    if (totalVulns > 0) {
      console.info();
      console.info(pc.dim(`Run ${pc.cyan('pnpm audit --fix')} to add overrides for non-vulnerable versions`));
    }
  } else {
    console.info();
    console.info(pc.green('✓ no vulnerabilities found'));
  }

  console.info();
}

// Allow direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const shouldClearCache = args.includes('--refresh');
  runOutdated(shouldClearCache).catch(console.error);
}
