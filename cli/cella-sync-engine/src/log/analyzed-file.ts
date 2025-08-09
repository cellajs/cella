import pc from "picocolors";
import { FileAnalysis } from "../types";
import { logConfig } from "../config";
import { log } from "node:console";

export function analyzedFileLine(analyzedFile: FileAnalysis): string {
  const status = '🗎';
  const filePath = getFilePath(analyzedFile);
  const gitStatus = getGitStatus(analyzedFile);
  const commitState = getCommitState(analyzedFile);
  const commitSha = getCommitSha(analyzedFile);
  const lastSyncedAt = getLastSyncedAt(analyzedFile);

  const parts: string[] = [
    status,
    filePath,
    gitStatus,
    commitState,
    commitSha,
    lastSyncedAt
  ].filter(Boolean);

  return parts.join(' ').trim();
}

export function logAnalyzedFileLine (analyzedFile: FileAnalysis, line: string): void {
  const mergeRiskSafeByGitConfigured = 'mergeRiskSafeByGit' in logConfig.analyzedFile;
  const commitSummaryStateConfigured = 'commitSummaryState' in logConfig.analyzedFile;

  const mergeRiskSafeByGitEqual = logConfig.analyzedFile.mergeRiskSafeByGit === analyzedFile.mergeRisk?.safeByGit;
  const commitSummaryStateEqual = logConfig.analyzedFile.commitSummaryState?.includes(analyzedFile.CommitSummary?.status || 'unknown');

  const shouldLog = [
    !mergeRiskSafeByGitConfigured || mergeRiskSafeByGitEqual,
    !commitSummaryStateConfigured || commitSummaryStateEqual,
  ].every(Boolean);

  if (shouldLog) console.log(line);
}

function getFilePath(analyzedFile: FileAnalysis): string {
  const filePath = analyzedFile.filePath;
  return pc.white(filePath);
}

function getGitStatus(analyzedFile: FileAnalysis): string {
  const gitStatus = analyzedFile.CommitSummary?.status || 'unknown';

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
  const commitsAhead = analyzedFile.CommitSummary?.commitsAhead || 0;
  const commitsBehind = analyzedFile.CommitSummary?.commitsBehind || 0;

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
  const lastSync = analyzedFile.CommitSummary?.lastSyncedAt;
  if (!lastSync) return '';
  if (analyzedFile.CommitSummary?.status === 'upToDate') return pc.dim('✔');
  const date = new Date(lastSync);
  return pc.dim(`Last in sync: ${date.toLocaleDateString()}`);
}