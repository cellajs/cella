import pc from 'picocolors';
import { FileAnalysis } from '../types';
import { config } from '../config';


export function analyzedSummaryLines(analyzedFiles: FileAnalysis[]): string[] {
  const Summary: Record<string, number> = {
    totalFiles: 0,
    safeByGit: 0,
    swizzled: 0,
    swizzledNew: 0,
  }

  for (const file of analyzedFiles) {
    Summary.totalFiles++;

    const swizzle = file.swizzle;
    if (swizzle) {
      if (swizzle?.existingMetadata?.swizzled || swizzle?.newMetadata?.swizzled) {
        Summary.swizzled++;
        if (swizzle.newMetadata?.swizzled) Summary.swizzledNew++;
      }
    }
  }

  return [
    `  Total Files: ${pc.bold(Summary.totalFiles)}`,
    `  Safe by Git: ${pc.bold(pc.cyan(Summary.safeByGit))} (${pc.bold(pc.cyan(Summary.totalFiles))} total files)`,
    `  Swizzled: ${pc.bold(pc.cyan(Summary.swizzled))} (${pc.bold(pc.cyan(Summary.swizzledNew))} new swizzles)`,
  ];
}

export function shouldLogAnalyzedSummaryModule(): boolean {
  const logModulesConfigured = 'modules' in config.log;
  if (!logModulesConfigured) return true;
  return config.log.modules?.includes('analyzedSummary') || false;
}

export function logAnalyzedSummaryLines(lines: string[]): void {
  if (lines.length === 0) return;

  const logModulesConfigured = 'modules' in config.log;
  const includesModule = config.log.modules?.includes('analyzedSummary');

  if (!logModulesConfigured || includesModule) {
    for (const line of lines) {
      console.log(line);
    }
  }
}
