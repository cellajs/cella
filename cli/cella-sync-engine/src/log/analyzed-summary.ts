import pc from 'picocolors';
import { FileAnalysis } from '../types';


export function analyzedSummaryLines(analyzedFiles: FileAnalysis[]): string[] {
  const Summary: Record<string, number> = {
    totalFiles: 0,
    lowRisk: 0,
    lowRiskSafeByGit: 0,
    mediumRisk: 0,
    mediumRiskSafeByGit: 0,
    highRisk: 0,
    highRiskSafeByGit: 0,
    safeByGit: 0,
  }

  for (const file of analyzedFiles) {
    Summary.totalFiles++;

    const mergeRisk = file.mergeRisk;
    if (!mergeRisk) continue;

    if (mergeRisk.likelihood === 'low') {
      Summary.lowRisk++;
      if (mergeRisk.safeByGit) Summary.lowRiskSafeByGit++;
    } else if (mergeRisk.likelihood === 'medium') {
      Summary.mediumRisk++;
      if (mergeRisk.safeByGit) Summary.mediumRiskSafeByGit++;
    } else if (mergeRisk.likelihood === 'high') {
      Summary.highRisk++;
      if (mergeRisk.safeByGit) Summary.highRiskSafeByGit++;
    }

    if (mergeRisk.safeByGit) {
      Summary.safeByGit++;
    }
  }

  return [
    pc.bold(`\nSummary:`),
    `  Total Files: ${pc.bold(Summary.totalFiles)}`,
    `  Low Risk: ${pc.green(Summary.lowRisk)} (${pc.green(Summary.lowRiskSafeByGit)} safe by Git)`,
    `  Medium Risk: ${pc.yellow(Summary.mediumRisk)} (${pc.yellow(Summary.mediumRiskSafeByGit)} safe by Git)`,
    `  High Risk: ${pc.red(Summary.highRisk)} (${pc.red(Summary.highRiskSafeByGit)} safe by Git)`,
    `  Safe by Git: ${pc.bold(pc.cyan(Summary.safeByGit))} (${pc.bold(pc.cyan(Summary.totalFiles))} total files)`,
  ];
}
