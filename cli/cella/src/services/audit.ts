/**
 * Audit service for the Cella CLI.
 *
 * Checks for outdated packages and security vulnerabilities across the monorepo.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { checkbox, confirm, Separator } from '@inquirer/prompts';
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
interface AuditOptions {
  /** Whether to clear the changelog cache before running */
  clearCache?: boolean;
  /** Whether to bypass pnpm metadata cache for fresh registry data */
  force?: boolean;
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

  // Clear pnpm metadata cache when force is set to get fresh registry data
  if (options.force) {
    spinner.text = 'clearing pnpm metadata cache...';
    clearCache();
    spawnSync('pnpm', ['cache', 'delete', '*'], {
      cwd: forkPath,
      stdio: 'ignore',
    });
    spinner.text = 'checking for outdated packages & vulnerabilities...';
  }

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
  if (enhancedPackages.length > 0) {
    printOutdatedResults(enhancedPackages, dependentNameCache, forkPath);
  }
  printVulnerabilityResults(auditResult, vulnMap);

  // Interactive update prompt (skip in non-interactive/list mode)
  // Show when there are outdated packages OR vulnerabilities to fix
  const hasVulns = vulnMap.size > 0;
  if ((enhancedPackages.length > 0 || hasVulns) && !config.list) {
    await promptForUpdates(enhancedPackages, forkPath, auditResult);
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
    Math.max(7, ...enhancedPackages.map((p) => p.name.length + (p.isDev ? DEV_TAG.length : 0))),
  );
  const maxCurrentLen = Math.max(7, ...enhancedPackages.map((p) => p.current.length));
  const maxLatestLen = Math.max(6, ...enhancedPackages.map((p) => p.latest.length));
  const maxDependentsLen = Math.min(
    MAX_DEPENDENTS_LEN,
    Math.max(10, ...enhancedPackages.map((p) => formatDependents(p.dependents).length)),
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
  const maxDependentNameLen = Math.max(0, ...sortedDependents.map(([name]) => name.length));
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
async function promptForUpdates(
  packages: EnhancedPackageInfo[],
  forkPath: string,
  auditResult: AuditResult | null,
): Promise<void> {
  const hasVulnerabilities =
    auditResult !== null && Object.values(auditResult.metadata?.vulnerabilities || {}).some((c) => c > 0);
  const hasPackages = packages.length > 0;

  // Ask if user wants to proceed (message adapts to what's available)
  let confirmMessage = 'update packages?';
  if (hasVulnerabilities && hasPackages) {
    confirmMessage = 'update packages and fix vulnerabilities?';
  } else if (hasVulnerabilities) {
    confirmMessage = 'fix vulnerabilities?';
  }

  let wantsUpdate: boolean;
  try {
    wantsUpdate = await confirm({
      message: confirmMessage,
      default: true,
    });
  } catch {
    return;
  }
  if (!wantsUpdate) return;

  console.info();

  // Build choice item for a package
  const makeChoice = (pkg: EnhancedPackageInfo) => {
    const devTag = pkg.isDev ? pc.dim(' (dev)') : '';
    const version = `${pc.red(pkg.current)} → ${pc.green(pkg.latest)}`;
    const pinnedWarning =
      pkg.pinnedIn.length > 0 ? `  ${pc.yellow('⚠')} ${pc.dim(`pinned in ${pkg.pinnedIn.join(', ')}`)}` : '';
    return {
      name: `${pkg.name}${devTag}  ${version}${pinnedWarning}`,
      value: pkg.name,
      checked: false,
    };
  };

  // Sentinel value for the audit --fix checkbox
  const AUDIT_FIX_VALUE = '__audit_fix__';

  // Split packages into groups: pinned and regular
  const pinned = packages.filter((p) => p.pinnedIn.length > 0);
  const regular = packages.filter((p) => p.pinnedIn.length === 0);

  // Build grouped choices with separators
  const choices: Array<{ name: string; value: string; checked: boolean } | Separator> = [];

  // Add audit --fix checkbox at the top when vulnerabilities exist
  if (hasVulnerabilities) {
    const vulnMeta = auditResult?.metadata?.vulnerabilities || {};
    const parts: string[] = [];
    if (vulnMeta.critical) parts.push(pc.red(`${vulnMeta.critical} critical`));
    if (vulnMeta.high) parts.push(pc.red(`${vulnMeta.high} high`));
    if (vulnMeta.moderate) parts.push(pc.yellow(`${vulnMeta.moderate} moderate`));
    if (vulnMeta.low) parts.push(pc.blue(`${vulnMeta.low} low`));
    const vulnSummary = parts.length > 0 ? ` ${pc.dim('·')} ${parts.join(' ')}` : '';
    choices.push(new Separator(pc.red(`── vulnerabilities${vulnSummary} ──`)));
    choices.push({
      name: `${pc.cyan('pnpm audit --fix')}  ${pc.dim('add overrides for non-vulnerable versions')}`,
      value: AUDIT_FIX_VALUE,
      checked: false,
    });
  }

  if (pinned.length > 0) {
    choices.push(new Separator(pc.yellow(`── pinned (${pinned.length}) ──`)));
    choices.push(...pinned.map(makeChoice));
  }
  if (regular.length > 0) {
    if (pinned.length > 0 || hasVulnerabilities) {
      choices.push(new Separator(pc.dim(`── packages (${regular.length}) ──`)));
    }
    choices.push(...regular.map(makeChoice));
  }

  let selected: string[];
  try {
    selected = await checkbox({
      message: 'toggle packages to update',
      choices,
      required: true,
      pageSize: 20,
      loop: false,
      theme: {
        icon: {
          cursor: '❯ ',
        },
        style: {
          highlight: (text: string) => text,
          keysHelpTip: (keys: [string, string][]) => {
            const tips = keys.map(([key, action]: [string, string]) => `${pc.dim(key)} ${action}`);
            return tips.join('  ');
          },
          renderSelectedChoices: (selectedChoices: Array<{ value?: string }>) =>
            pc.dim(`${selectedChoices.length} package${selectedChoices.length !== 1 ? 's' : ''} selected`),
        },
      },
    });
  } catch {
    // User pressed Ctrl+C or escaped
    return;
  }

  // Extract audit --fix selection and filter it from package selections
  const runAuditFix = selected.includes(AUDIT_FIX_VALUE);
  const selectedPackages = selected.filter((s) => s !== AUDIT_FIX_VALUE);

  // Print summary of what will happen
  const summaryParts: string[] = [];
  if (selectedPackages.length > 0) {
    summaryParts.push(`updating ${selectedPackages.length} package${selectedPackages.length !== 1 ? 's' : ''}`);
  }
  if (runAuditFix) {
    summaryParts.push('then updating dependencies');
  }
  console.info();
  console.info(pc.green(`✓ ${summaryParts.join(' ')}`));
  console.info();

  // Check if any major updates are selected
  const selectedMajor = packages.filter((p) => selectedPackages.includes(p.name) && p.isMajorUpdate);
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
  for (const pkgName of selectedPackages) {
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

  // Run pnpm audit --fix first (before package updates) so overrides are applied during install
  if (runAuditFix) {
    console.info(pc.dim('running pnpm audit --fix...'));
    const auditFixResult = spawnSync('pnpm', ['audit', '--fix'], {
      cwd: forkPath,
      stdio: 'inherit',
    });

    console.info();
    if (auditFixResult.status === 0) {
      console.info(pc.green('✓ pnpm audit --fix completed'));
    } else {
      console.error(pc.red(`✗ pnpm audit --fix failed (exit code ${auditFixResult.status})`));
    }
  }

  // Build pnpm update commands and run with inherited stdio so user sees pnpm output directly
  const commands: string[] = [];
  for (const [workspace, { filter, packages: pkgs }] of workspacePackages) {
    const pkgList = pkgs.join(', ');
    console.info(`${pc.cyan('↑')} ${pc.bold(workspace)}: ${pc.dim(pkgList)}`);
    commands.push(`pnpm --filter ${filter} up --latest ${pkgs.join(' ')}`);
  }

  if (selectedPackages.length > 0) {
    console.info();

    // Run combined command with inherited stdio so pnpm output streams directly to terminal
    const combined = commands.join(' && ');
    const result = spawnSync('sh', ['-c', combined], {
      cwd: forkPath,
      stdio: 'inherit',
    });

    console.info();
    if (result.status === 0) {
      console.info(pc.green(`✓ ${selectedPackages.length} package${selectedPackages.length > 1 ? 's' : ''} updated`));
    } else {
      console.error(pc.red(`✗ update failed (exit code ${result.status})`));
    }
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
  } else {
    console.info();
    console.info(`${pc.green('✓')} no vulnerabilities found`);
  }

  console.info();
}
