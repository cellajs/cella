import pc from "picocolors";
import { FileAnalysis } from "../types";
import { logConfig } from "../config";

export function analyzedFileLine(analyzedFile: FileAnalysis): string {
  const status = '🗎';
  const filePath = getFilePath(analyzedFile);
  const gitStatus = getGitStatus(analyzedFile);
  const commitState = getCommitState(analyzedFile);
  const commitSha = getCommitSha(analyzedFile);
  const lastSyncedAt = getLastSyncedAt(analyzedFile);
  const conflictTag = getConflictTag(analyzedFile);
  const conflictResolution = getConfictResolution(analyzedFile);

  const parts: string[] = [
    status,
    filePath,
    gitStatus,
    commitState,
    commitSha,
    lastSyncedAt,
    conflictTag,
    conflictResolution,
  ].filter(Boolean);

  return parts.join(' ').trim();
}

export function logAnalyzedFileLine(analyzedFile: FileAnalysis, line: string): void {
  const mergeRiskSafeByGitConfigured = 'mergeRiskSafeByGit' in logConfig.analyzedFile;
  const commitSummaryStateConfigured = 'commitSummaryState' in logConfig.analyzedFile;
  const filePathConfigured = 'filePath' in logConfig.analyzedFile;

  const mergeRiskSafeByGitEqual = logConfig.analyzedFile.mergeRiskSafeByGit === analyzedFile.mergeRisk?.safeByGit;
  const commitSummaryStateEqual = logConfig.analyzedFile.commitSummaryState?.includes(analyzedFile.commitSummary?.status || 'unknown');
  const filePathEqual = logConfig.analyzedFile.filePath?.includes(analyzedFile.filePath);

  const shouldLog = [
    !mergeRiskSafeByGitConfigured || mergeRiskSafeByGitEqual,
    !commitSummaryStateConfigured || commitSummaryStateEqual,
    !filePathConfigured || filePathEqual,
  ].every(Boolean);

  if (shouldLog) console.log(line);
}

function getFilePath(analyzedFile: FileAnalysis): string {
  const filePath = analyzedFile.filePath;
  return pc.white(filePath);
}

function getGitStatus(analyzedFile: FileAnalysis): string {
  const gitStatus = analyzedFile.commitSummary?.status || 'unknown';

  if (gitStatus === 'upToDate') {
    return `fork: ${pc.bold(pc.green('Up to date'))}`
  }
  if (gitStatus === 'ahead') {
    return `fork: ${pc.bold(pc.green('Ahead'))}`;
  }
  if (gitStatus === 'behind') {
    return `fork: ${pc.bold(pc.yellow('Behind'))}`;
  }
  if (gitStatus === 'diverged') {
    return `fork: ${pc.bold(pc.red('Diverged'))}`;
  }
  if (gitStatus === 'unrelated') {
    return `fork: ${pc.bold(pc.red('Unrelated'))}`;
  }
  return `fork: ${pc.bold(pc.red('Unknown state'))}`;
}

function getCommitState(analyzedFile: FileAnalysis): string {
  const commitsAhead = analyzedFile.commitSummary?.commitsAhead || 0;
  const commitsBehind = analyzedFile.commitSummary?.commitsBehind || 0;

  if (commitsAhead > 0 && commitsBehind > 0) {
    return pc.bold(`(↑ ${pc.green(commitsAhead)} ↓ ${pc.yellow(commitsBehind)})`);
  }
  if (commitsAhead > 0) {
    return pc.bold(`↑ ${pc.green(commitsAhead)}`);
  }
  if (commitsBehind > 0) {
    return pc.bold(`↓ ${pc.yellow(commitsBehind)}`);
  }
  return '';
}

function getCommitSha(analyzedFile: FileAnalysis): string {
  const forkSha = analyzedFile.forkFile?.shortCommitSha;
  const boilerSha = analyzedFile.boilerplateFile?.shortCommitSha;

  if (forkSha && boilerSha) {
    if (forkSha === boilerSha) return `(${forkSha})`
    return `(${forkSha} → ${boilerSha})`;
  }

  return `${forkSha || boilerSha}`;
}

function getLastSyncedAt(analyzedFile: FileAnalysis): string {
  const lastSync = analyzedFile.commitSummary?.lastSyncedAt;
  if (!lastSync) return '';
  if (analyzedFile.commitSummary?.status === 'upToDate') return pc.dim('✔');
  const date = new Date(lastSync);
  return pc.dim(`Last in sync: ${date.toLocaleDateString()}`);
}

function getConflictTag(analyzedFile: FileAnalysis): string {
  const mergeRisk = analyzedFile.mergeRisk;

  if (!mergeRisk) return '';
  if (mergeRisk.safeByGit) return '';

  if (mergeRisk?.likelihood === 'medium') {
    return pc.bgYellow(pc.black(' Conflict '))
  }

  return pc.bgRed(pc.black(' Conflict '));
}

function getConfictResolution(analyzedFile: FileAnalysis): string {
  const mergeRisk = analyzedFile.mergeRisk;

  if (!mergeRisk) return '';
  if (mergeRisk.likelihood === 'low') return '';
  if (mergeRisk.safeByGit) return pc.green(`→ Safe by ${pc.bold('Git')} (${mergeRisk.reason})`);

  if (mergeRisk.check) return pc.dim(`→ ${mergeRisk.check} (${mergeRisk.reason})`);
  return '';
}