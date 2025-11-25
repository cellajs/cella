import pc from 'picocolors';
import { FileAnalysis, PackageJson } from '../types';
import { config } from '../config';


export function packageSummaryLines(
  analyzedFile: FileAnalysis,
  forkPackageJson: PackageJson | null,
  depsToUpdate: Record<string, string>,
  devDepsToUpdate: Record<string, string>
): string[] {

  const amountOfDepsToUpdate = Object.keys(depsToUpdate).length;
  const amountOfDevDepsToUpdate = Object.keys(devDepsToUpdate).length;

  const lines: string[] = [
    pc.bold(`\n${analyzedFile.filePath}:`)
  ];

  if (!amountOfDepsToUpdate && !amountOfDevDepsToUpdate) {
    lines.push(pc.gray('  - No dependencies to update.'));
  } else {

    lines.push('Dependencies:');
    if (!amountOfDepsToUpdate) {
      lines.push(pc.gray('  - No dependencies to update.'));
    } else {
      for (const dep in depsToUpdate) {
        lines.push(`  - ${dep}: ${forkPackageJson?.dependencies?.[dep]} → ${pc.bold(pc.cyan(depsToUpdate[dep]))}`);
      }
    }

    lines.push('Dev Dependencies:');
    if (!amountOfDevDepsToUpdate) {
      lines.push(pc.gray('  - No dev dependencies to update.'));
    } else {
      for (const dep in devDepsToUpdate) {
        lines.push(`  - ${dep}: ${forkPackageJson?.devDependencies?.[dep]} → ${pc.bold(pc.cyan(devDepsToUpdate[dep]))}`);
      }
    }
  }

  return lines;
}

export function shouldLogPackageSummaryModule(): boolean {
  const logModulesConfigured = 'modules' in config.log;
  if (!logModulesConfigured) return true;
  return config.log.modules?.includes('packageSummary') || false;
}

export function logPackageSummaryLines(lines: string[]): void {
  if (lines.length === 0) return;

  if (!shouldLogPackageSummaryModule()) return;

  for (const line of lines) {
    console.info(line);
  }
}
