/**
 * Audit utilities for the Cella CLI audit service.
 *
 * Provides npm registry fetching, changelog detection, vulnerability parsing, and caching.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';

/*************************************************************************************************
 * Types
 ************************************************************************************************/

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

/** Parsed dependency path info from pnpm audit */
export interface DependencyPathInfo {
  /** The workspace name (e.g., 'frontend', 'backend') */
  workspace: string | null;
  /** The direct dependency in the workspace that starts the chain */
  directDependency: string | null;
}

/*************************************************************************************************
 * Constants
 ************************************************************************************************/

/** Cache file location (in cli/cella directory) */
export const CACHE_FILE = path.join(import.meta.dirname, '..', '.audit.cache.json');

/** Cache TTL: 7 days in ms */
export const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

/** Common changelog file paths to check in GitHub repos */
export const CHANGELOG_PATHS = ['CHANGELOG.md', 'CHANGELOG', 'changelog.md', 'HISTORY.md', 'CHANGES.md', 'NEWS.md'];

/** Default branches to check for changelog files */
export const DEFAULT_BRANCHES = ['main', 'master'] as const;

/*************************************************************************************************
 * Cache Functions
 ************************************************************************************************/

/** Loads the changelog cache from disk. */
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

/** Saves the changelog cache to disk. */
export function saveCache(cache: ChangelogCache): void {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // Ignore cache write errors
  }
}

/** Clears the changelog cache. */
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

/*************************************************************************************************
 * NPM Registry Functions
 ************************************************************************************************/

/** Fetches package metadata from npm registry. */
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

/** Checks whether the provided URL points to a GitHub repository. */
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

/** Get GitHub releases URL */
export function getReleasesUrl(repoUrl: string | null): string | null {
  if (!isGitHubRepoUrl(repoUrl)) return null;
  return `${repoUrl}/releases`;
}

/*************************************************************************************************
 * Version Utilities
 ************************************************************************************************/

/** Checks if the update is a major version change. */
export function isMajorVersionChange(current: string, latest: string): boolean {
  const currentMajor = current.split('.')[0]?.replace(/^\D+/, '');
  const latestMajor = latest.split('.')[0]?.replace(/^\D+/, '');
  if (!currentMajor || !latestMajor) return false;
  return Number.parseInt(latestMajor, 10) > Number.parseInt(currentMajor, 10);
}

/*************************************************************************************************
 * Outdated Package Functions
 ************************************************************************************************/

/**
 * Runs pnpm outdated and returns JSON output.
 * Note: pnpm outdated exits with code 1 when packages are outdated,
 * so we need to handle this as a normal case, not an error.
 */
export function getOutdatedPackages(cwd: string): Record<string, OutdatedPackage> {
  try {
    const result = execFileSync('pnpm', ['-r', 'outdated', '--json'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
      cwd,
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

/*************************************************************************************************
 * Vulnerability Functions
 ************************************************************************************************/

/**
 * Runs pnpm audit and returns parsed JSON output.
 * Returns null if audit fails or no vulnerabilities found.
 */
export function runPnpmAudit(cwd: string): AuditResult | null {
  try {
    const result = execFileSync('pnpm', ['audit', '--json'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      maxBuffer: 10 * 1024 * 1024,
      cwd,
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

/** Creates a map of package name -> vulnerabilities from audit result. */
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

/*************************************************************************************************
 * Display Utilities
 ************************************************************************************************/

/** Gets vulnerability severity icon with color. */
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

/** Gets the highest severity from a list of vulnerabilities. */
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

/** Formats dependents as "first +N" if multiple. */
export function formatDependents(dependents: string[]): string {
  if (dependents.length === 0) return '';
  if (dependents.length === 1) return dependents[0];
  return `${dependents[0]} +${dependents.length - 1}`;
}

/**
 * Formats a clickable terminal link (OSC 8 escape sequence).
 * Falls back to plain text if terminal doesn't support it.
 */
export function terminalLink(text: string, url: string): string {
  // Strip control characters from URL to prevent terminal escape injection (CWE-116)
  const safeUrl = url.replace(/[\x00-\x1f\x7f]/g, '');
  // OSC 8 hyperlink format: \e]8;;URL\e\\TEXT\e]8;;\e\\
  return `\u001B]8;;${safeUrl}\u0007${text}\u001B]8;;\u0007`;
}
