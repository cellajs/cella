import pc from "picocolors";
import { FileAnalysis } from "../types";
import { config } from "../config";

export function analyzedFileLine(analyzedFile: FileAnalysis): string {
  const status = '🗎';
  const filePath = getFilePath(analyzedFile);
  const gitStatus = getGitStatus(analyzedFile);
  const commitState = getCommitState(analyzedFile);
  const commitSha = getCommitSha(analyzedFile);
  const lastSyncedAt = getLastSyncedAt(analyzedFile);
  const strategyFlag = getStrategyFlag(analyzedFile);
  const strategyReason = getStrategyReason(analyzedFile);

  const parts: string[] = [
    status,
    filePath,
    gitStatus,
    commitState,
    commitSha,
    lastSyncedAt,
    strategyFlag,
    strategyReason,
  ].filter(Boolean);

  return parts.join(' ').trim();
}

export function shouldLogAnalyzedFileModule(): boolean {
  const logModulesConfigured = 'modules' in config.log;
  if (!logModulesConfigured) return true;
  return config.log.modules?.includes('analyzedFile') || false;
}

export function logAnalyzedFileLine(analyzedFile: FileAnalysis, line: string): void {
  const logModulesConfigured = 'modules' in config.log;
  const commitSummaryStateConfigured = 'commitSummaryState' in config.log.analyzedFile;
  const filePathConfigured = 'filePath' in config.log.analyzedFile;
  const mergeStrategyConfigured = 'mergeStrategyStrategy' in config.log.analyzedFile;

  const includesModule = config.log.modules?.includes('analyzedFile');
  const commitSummaryStateEqual = config.log.analyzedFile.commitSummaryState?.includes(analyzedFile.commitSummary?.status || 'unknown');
  const filePathEqual = config.log.analyzedFile.filePath?.includes(analyzedFile.filePath);
  const mergeStrategyEqual = config.log.analyzedFile.mergeStrategyStrategy?.includes(analyzedFile.mergeStrategy?.strategy || 'unknown');

  const shouldLog = [
    !logModulesConfigured || includesModule,
    !commitSummaryStateConfigured || commitSummaryStateEqual,
    !filePathConfigured || filePathEqual,
    !mergeStrategyConfigured || mergeStrategyEqual,
  ].every(Boolean);

  if (shouldLog) console.info(line);
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

function getStrategyFlag(analyzedFile: FileAnalysis): string {
  const mergeStrategy = analyzedFile.mergeStrategy;

  if (!mergeStrategy) {
    return pc.bgRed(pc.black(' No Strategy '));
  }

  if (mergeStrategy.strategy === 'unknown') {
    return pc.bgRed(pc.black(`${mergeStrategy.strategy} `));
  }

  if (mergeStrategy.strategy === 'manual') {
    return pc.bgYellow(pc.black(` ${mergeStrategy.strategy} `));
  }

  return pc.green(pc.black(` ${mergeStrategy.strategy} `));
}

function getStrategyReason(analyzedFile: FileAnalysis): string {
  const mergeStrategy = analyzedFile.mergeStrategy;

  if (!mergeStrategy) return '';

  if (mergeStrategy.strategy === 'unknown') return pc.red(`→ ${mergeStrategy.reason}`);
  if (mergeStrategy.strategy === 'manual') return pc.yellow(`→ ${mergeStrategy.reason}`);
  return pc.green(`→ ${mergeStrategy.reason}`);
}