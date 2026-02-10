/**
 * Audit service for the Cella CLI.
 *
 * Checks for outdated packages and security vulnerabilities across the monorepo.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { checkbox, confirm } from '@inquirer/prompts';
import pc from 'picocolors';
import type { RuntimeConfig } from '../config/types';
import {
  type AuditResult,
  buildVulnerabilityMap,
  clearCache,
  type EnhancedPackageInfo,
  fetchNpmMetadata,
  findChangelogUrl,
  formatDependents,
  getHighestSeverity,
  getOutdatedPackages,
  getReleasesUrl,
  getRepoUrl,
  getVulnIcon,
  isMajorVersionChange,
  loadCache,
  middleTruncate,
  runPnpmAudit,
  saveCache,
  terminalLink,
  type VulnerabilityInfo,
} from '../utils/audit-utils';
import { createSpinner, spinnerSuccess } from '../utils/display';

/** Options for the audit service */
export interface AuditOptions {
  /** Whether to clear the cache before running */
  clearCache?: boolean;
}

/**
 * Audit service - checks for outdated packages and security vulnerabilities.
 */
export async function runAudit(config: RuntimeConfig, options: AuditOptions = {}): Promise<void> {
  const { forkPath } = config;

  // Handle cache clearing
  if (options.clearCache) {
    clearCache();
    return;
  }

  const spinner = createSpinner('checking for outdated packages & vulnerabilities...');

  // Run outdated check and audit in parallel
  const [outdatedPackages, auditResult] = await Promise.all([
    Promise.resolve(getOutdatedPackages(forkPath)),
    Promise.resolve(runPnpmAudit(forkPath)),
  ]);

  const packageNames = Object.keys(outdatedPackages);
  const vulnMap = buildVulnerabilityMap(auditResult);

  if (packageNames.length === 0 && vulnMap.size === 0) {
    spinnerSuccess('all packages are up to date and secure');
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

        // Detect workspaces where this package is pinned (exact version, no ^ or ~)
        const pinnedIn: string[] = [];
        for (const d of pkg.dependentPackages) {
          try {
            const pkgJson = JSON.parse(fs.readFileSync(path.join(d.location, 'package.json'), 'utf-8'));
            const spec = pkgJson[pkg.dependencyType]?.[name] || '';
            if (spec && !spec.startsWith('^') && !spec.startsWith('~') && !spec.startsWith('>')) {
              pinnedIn.push(d.name.replace('@cella/', ''));
            }
          } catch {
            // skip
          }
        }

        return {
          name,
          current: pkg.current,
          latest: pkg.latest,
          dependents: pkg.dependentPackages.map((d) => d.name.replace('@cella/', '')),
          dependentLocations: pkg.dependentPackages.map((d) => d.location),
          isDev: pkg.dependencyType === 'devDependencies',
          isMajorUpdate: isMajorVersionChange(pkg.current, pkg.latest),
          pinnedIn,
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

  // Stop spinner
  spinner.stop();

  // Print results
  printOutdatedResults(enhancedPackages, dependentNameCache, forkPath);
  printVulnerabilityResults(auditResult, vulnMap);

  // Interactive update prompt (skip in non-interactive/list mode)
  if (enhancedPackages.length > 0 && !config.list) {
    await promptForUpdates(enhancedPackages, forkPath);
  }
}

/**
 * Print outdated packages results table.
 */
function printOutdatedResults(
  enhancedPackages: EnhancedPackageInfo[],
  dependentNameCache: Map<string, string>,
  forkPath: string,
): void {
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
  for (const [dependentName, { location, count }] of sortedDependents) {
    const packageJsonPath = path.join(location, 'package.json');
    const relativePath = path.relative(forkPath, packageJsonPath);
    const paddedName = dependentName.padEnd(maxDependentNameLen);
    console.info(
      `  ${pc.dim('•')} ${paddedName}  ${terminalLink(relativePath, `file://${packageJsonPath}`)} ${pc.dim(`${count}`)}`,
    );
  }
}

/**
 * Prompt user to select packages to update, then run pnpm up.
 */
async function promptForUpdates(packages: EnhancedPackageInfo[], forkPath: string): Promise<void> {
  // Ask if user wants to update packages
  let wantsUpdate: boolean;
  try {
    wantsUpdate = await confirm({
      message: 'update packages?',
      default: true,
    });
  } catch {
    return;
  }
  if (!wantsUpdate) return;

  // Build choices
  const choices: Array<{ name: string; value: string; checked: boolean }> = packages.map((pkg) => {
    const devTag = pkg.isDev ? pc.dim(' (dev)') : '';
    const version = `${pc.red(pkg.current)} → ${pc.green(pkg.latest)}`;
    const pinnedWarning =
      pkg.pinnedIn.length > 0 ? `  ${pc.yellow('⚠')} ${pc.dim(`pinned in ${pkg.pinnedIn.join(', ')}`)}` : '';
    return {
      name: `${pkg.name}${devTag}  ${version}${pinnedWarning}`,
      value: pkg.name,
      checked: false,
    };
  });

  let selected: string[];
  try {
    selected = await checkbox({
      message: `toggle packages to update\n${pc.dim('↑↓')} navigate  ${pc.dim('space')} toggle  ${pc.dim('⏎')} confirm  ${pc.dim('esc')} skip`,
      choices,
      pageSize: 20,
      loop: false,
      theme: {
        icon: {
          cursor: '❯ ',
        },
        style: {
          highlight: (text: string) => text,
          renderSelectedChoices: (selectedChoices: Array<{ value?: string }>) =>
            pc.dim(`${selectedChoices.length} package${selectedChoices.length !== 1 ? 's' : ''} selected`),
        },
      },
    });
  } catch {
    // User pressed Ctrl+C or escaped
    return;
  }

  // Handle empty selection
  if (selected.length === 0) {
    return;
  }

  // Check if any major updates are selected
  const selectedMajor = packages.filter((p) => selected.includes(p.name) && p.isMajorUpdate);
  if (selectedMajor.length > 0) {
    const majorNames = selectedMajor.map((p) => pc.bold(p.name)).join(', ');
    try {
      const proceed = await confirm({
        message: `${selectedMajor.length} major update${selectedMajor.length > 1 ? 's' : ''} selected (${majorNames}). proceed?`,
        default: true,
      });
      if (!proceed) {
        console.info(pc.dim('  update cancelled'));
        return;
      }
    } catch {
      return;
    }
  }

  // Group selected packages by workspace
  const workspacePackages = new Map<string, { filter: string; packages: string[] }>();
  for (const pkgName of selected) {
    const pkg = packages.find((p) => p.name === pkgName);
    if (!pkg) continue;

    for (let i = 0; i < pkg.dependents.length; i++) {
      const dependent = pkg.dependents[i];
      const location = pkg.dependentLocations[i];
      if (!workspacePackages.has(dependent)) {
        // Read the workspace package name from package.json for --filter
        const pkgJsonPath = path.join(location, 'package.json');
        let filterName = dependent;
        try {
          const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
          filterName = pkgJson.name || dependent;
        } catch {
          // Use dependent name as fallback
        }
        workspacePackages.set(dependent, { filter: filterName, packages: [] });
      }
      workspacePackages.get(dependent)?.packages.push(pkgName);
    }
  }

  // Build pnpm update commands and run with inherited stdio so user sees pnpm output directly
  const commands: string[] = [];
  for (const [workspace, { filter, packages: pkgs }] of workspacePackages) {
    const pkgList = pkgs.join(', ');
    console.info(`  ${pc.cyan('↑')} ${pc.bold(workspace)}: ${pc.dim(pkgList)}`);
    commands.push(`pnpm --filter ${filter} up --latest ${pkgs.join(' ')}`);
  }

  console.info();

  // Run combined command with inherited stdio so pnpm output streams directly to terminal
  const combined = commands.join(' && ');
  const result = spawnSync('sh', ['-c', combined], {
    cwd: forkPath,
    stdio: 'inherit',
  });

  console.info();
  if (result.status === 0) {
    console.info(pc.green(`✓ ${selected.length} package${selected.length > 1 ? 's' : ''} updated`));
  } else {
    console.error(pc.red(`✗ update failed (exit code ${result.status})`));
  }
}

/**
 * Print vulnerability summary section.
 */
function printVulnerabilityResults(auditResult: AuditResult | null, vulnMap: Map<string, VulnerabilityInfo[]>): void {
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
      console.info(
        pc.dim('run ') + pc.cyan('pnpm audit --fix') + pc.dim(' to add overrides for non-vulnerable versions'),
      );
    }
  } else {
    console.info();
    console.info(`${pc.green('✓')} no vulnerabilities found`);
  }

  console.info();
}
