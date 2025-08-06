import type { FileEntry } from './get-git-file-hashes';
import { type RepoConfig } from './config';
import { getFileCommitComparison, CommitComparisonSummary } from './file-commit-comparison';
import pLimit from 'p-limit';

/**
 * Describes the synchronization status of a file’s commit history
 * between the boilerplate and a forked repository.
 *
 * - `UpToDate`: The file exists in both repositories and matches in both content (blob SHA) and commit SHA.
 * - `Missing`: The file exists in the boilerplate but does not exist in the fork.
 * - `Outdated`: The file exists in the fork, but its latest version is older than the one in the boilerplate (e.g. missing newer changes).
 * - `Diverged`: The file has changes in both the boilerplate and the fork since their last shared commit — both versions evolved independently.
 * - `Ahead`: The fork contains changes (commits or content) not yet present in the boilerplate, and the boilerplate has not changed since their last common commit.
 * - `Behind`: The boilerplate contains changes not yet present in the fork, and the fork has not changed since their last common commit.
 * - `Unrelated`: No shared commit history could be found between the two versions — they likely originated independently.
 */
export enum FileSyncState {
  UpToDate = 'upToDate',
  Missing = 'missing',
  Outdated = 'outdated',
  Diverged = 'diverged',
  Ahead = 'ahead',
  Behind = 'behind',
  Unrelated = 'unrelated',
}

/**
 * Enum describing the strategy to resolve a possible conflict for a file.
 *
 * - `KeepBoilerplate`: Resolve the conflict by keeping the boilerplate version of the file.
 * - `KeepFork`: Resolve the conflict by keeping the forked version of the file.
 * - `ManualMerge`: The conflict requires manual intervention to merge changes.
 * - `Unknown`: The resolution strategy is not determined or is unknown.
 */
export enum ResolutionStrategy {
  KeepBoilerplate = 'keepBoilerplate',
  KeepFork = 'keepFork',
  ManualMerge = 'manualMerge',
  Unknown = 'unknown',
}

/**
 * Represents the predicted likelihood of a conflict occurring.
 *
 * - `Low`: We are confident no conflict will occur.
 * - `Medium`: Some risk of conflict, depending on other factors.
 * - `High`: Very likely to cause a conflict during sync or merge.
 */
export enum ConflictLikelihood {
  Low = 1,
  Medium = 2,
  High = 3
}

/**
 * Enumerates the reasons why a conflict is expected between the
 * boilerplate and forked file.
 *
 * - `DivergedHistories`: The file has diverging commits in each repo.
 * - `BlobMismatch`: The file content differs even if commit is same.
 * - `MissingInFork`: The file is missing in the forked repository.
 * - `UnrelatedHistories`: No shared commit ancestry found.
 * - `OutdatedInFork`: The forked file is behind the boilerplate.
 * - `None`: No conflict expected.
 */
export enum ConflictReason {
  DivergedHistories = 'divergedHistories',
  BlobMismatch = 'blobMismatch',
  MissingInFork = 'missingInFork',
  UnrelatedHistories = 'unrelatedHistories',
  OutdatedInFork = 'outdatedInFork',
  None = 'none',
}

/**
 * Enumerates the reasons a resolution strategy was selected.
 *
 * - `ForkHasNewerCommits`: Fork is ahead, keep fork changes
 * - `BoilerplateHasNewerCommits`: Fork is behind, keep boilerplate changes
 * - `ShouldBeIdentical`: Files expected to be identical, choice doesn't matter
 * - `ShouldBeAutoMerged`: No conflicts expected, git can auto-merge safely
 * - `ManualMergeRequired`: User must decide (e.g. missing files)
 * - `Unknown`: Unknown or unspecified reason
 */
export enum ResolutionReason {
  ForkHasNewerCommits = 'forkHasNewerCommits',
  BoilerplateHasNewerCommits = 'boilerplateHasNewerCommits',
  ShouldBeIdentical = 'shouldBeIdentical',
  ShouldBeAutoMerged = 'shouldBeAutoMerged',
  ManualMergeRequired = 'manualMergeRequired',
  Unknown = 'unknown',
}

/**
 * Enum representing the file content (blob) comparison status
 * 
 * `Identical`: The file content is exactly the same in both repositories.
 * `Different`: The file content differs between the two repositories.
 * `Unknown`: The comparison could not be determined, e.g., due to missing data or inaccessible files.
 */
export enum BlobComparisonStatus {
  Identical = 'identical',
  Different = 'different',
  Unknown = 'unknown',
}

/**
 * Indicates who can auto-resolve the conflict, if anyone.
 * 
 * `None`: No automatic resolution possible
 * `Git`: Git can auto-resolve this conflict
 */
export enum AutoResolvable {
  None = 'none',
  Git = 'git',
}

/**
 * Describes the predicted conflict state of a file and
 * the strategy chosen to resolve it.
 * 
 * @property syncState - The current synchronization state between the boilerplate and fork.
 * @property conflictLikelihood - A confidence level (1–3) indicating the likelihood of a conflict.
 * @property conflictReason - A machine-readable code explaining the cause of the predicted conflict.
 * @property autoResolvable - Whether the conflict can be safely auto-resolved without manual intervention.
 * @property resolutionStrategy - The strategy selected to resolve the file conflict.
 * @property resolutionReason - The reason for selecting the resolution strategy.
 */
export type ConflictAnalysis = {
  syncState: FileSyncState;
  conflictLikelihood: ConflictLikelihood;
  conflictReason: ConflictReason;
  autoResolvable: AutoResolvable;
  resolutionStrategy: ResolutionStrategy;
  resolutionReason?: ResolutionReason;
  blobStatus: BlobComparisonStatus;
};

/**
 * Represents a full analysis of a file’s synchronization and conflict state
 * between a boilerplate repository and a fork.
 * 
 * @property filePath - The relative path of the file within the repository.
 * @property boilerplateFile - Metadata and hash information for the boilerplate version of the file.
 * @property forkedFile - Metadata and hash information for the forked version of the file, if it exists.
 * @property commitComparison - Summary data comparing the commit histories of the boilerplate and fork for this file.
 * @property conflictAnalysis - The predicted conflict state of the file and the resolution strategy selected.
 */
export type FileSyncAnalysis = {
  filePath: string;
  boilerplateFile: FileEntry;
  forkedFile?: FileEntry;
  commitComparison?: CommitComparisonSummary;
  conflictAnalysis: ConflictAnalysis;
};

// Run 10 analyses at a time
const limit = pLimit(10);

/**
 * Generates a detailed sync and conflict analysis for files between
 * a boilerplate repository and its fork.
 * 
 * This function compares file entries from both repositories and
 * produces an array of analyses describing the sync status,
 * commit comparisons, and conflict predictions for each file.
 * 
 * @param boilerplateConfig - Configuration for the boilerplate repository.
 * @param forkConfig - Configuration for the forked repository.
 * @param boilerplateFiles - List of files from the boilerplate repository.
 * @param forkFiles - List of files from the forked repository.
 * @returns A promise that resolves to an array of FileSyncAnalysis objects,
 * each representing the sync and conflict state for a specific file.
 */
export async function getFileSyncAnalyses(
  boilerplateConfig: RepoConfig,
  forkConfig: RepoConfig,
  boilerplateFiles: FileEntry[],
  forkFiles: FileEntry[]
): Promise<FileSyncAnalysis[]> {

  const forkMap = new Map(forkFiles.map(file => [file.path, file]));
  const analysisPromises = boilerplateFiles.map(boilerplateFile =>
    limit(async () => {
      const filePath = boilerplateFile.path;
      const forkedFile = forkMap.get(filePath);
      const commitComparison = await getFileCommitComparison(boilerplateConfig, forkConfig, filePath);
      const conflictAnalysis: ConflictAnalysis = getConflictAnalysis(boilerplateFile, forkedFile, commitComparison);

      return {
        filePath,
        boilerplateFile,
        forkedFile,
        commitComparison,
        conflictAnalysis,
      };
    })
  );

  return Promise.all(analysisPromises);
}

/**
 * Analyzes conflict-related properties of a file given its boilerplate
 * and forked versions plus commit comparison data.
 * 
 * @param boilerplateFile - File entry from boilerplate repo
 * @param forkedFile - Corresponding file entry from fork repo (optional)
 * @param commitComparison - Summary of commit comparison between boilerplate and fork (optional)
 * @returns ConflictAnalysis object describing sync state and resolution info
 */
function getConflictAnalysis(
  boilerplateFile: FileEntry,
  forkedFile?: FileEntry,
  commitComparison?: CommitComparisonSummary
): ConflictAnalysis {
  const syncState = getSyncState(boilerplateFile, forkedFile, commitComparison);
  const blobStatus = getBlobStatus(boilerplateFile, forkedFile);
  const conflictLikelihood = getConflictLikelihood(syncState, blobStatus);
  const conflictReason = getConflictReason(syncState, blobStatus);
  const autoResolvable = getAutoResolvable(syncState, blobStatus);
  const resolutionStrategy = getResolutionStrategy(syncState, conflictLikelihood, autoResolvable);
  const resolutionReason = getResolutionReason(syncState, blobStatus);

  return {
    syncState,
    blobStatus,
    conflictLikelihood,
    conflictReason,
    autoResolvable,
    resolutionStrategy,
    resolutionReason,
  };
}

/**
 * Determines the synchronization state between boilerplate and fork files,
 * based on commit comparison.
 * 
 * @param boilerplateFile - File entry from boilerplate repo
 * @param forkedFile - File entry from fork repo (optional)
 * @param commitComparison - Commit comparison summary (optional)
 * @returns FileSyncState enum describing sync status
 */
function getSyncState(
  boilerplateFile: FileEntry,
  forkedFile?: FileEntry,
  commitComparison?: CommitComparisonSummary
): FileSyncState {
  if (!forkedFile) return FileSyncState.Missing;

  if (boilerplateFile.lastCommitSha === forkedFile.lastCommitSha) {
    // Further checks can be added here for blob comparison if needed
    return FileSyncState.UpToDate;
  }

  if (commitComparison) {
    switch (commitComparison.status) {
      case 'ahead':
        return FileSyncState.Ahead;
      case 'behind':
        return FileSyncState.Behind;
      case 'diverged':
        return FileSyncState.Diverged;
      case 'unrelated':
        return FileSyncState.Unrelated;
      default:
        return FileSyncState.Outdated;
    }
  }

  return FileSyncState.Outdated;
}

/**
 * Compares the blob SHA of two file entries to determine their content status.
 *
 * @param boilerplateFile - The file entry from the boilerplate repository.
 * @param forkedFile - The file entry from the forked repository, if present.
 * @returns A BlobComparisonStatus indicating whether the files' contents are identical, different, or unknown.
 */
function getBlobStatus(
  boilerplateFile: FileEntry,
  forkedFile?: FileEntry
): BlobComparisonStatus {
  if (!forkedFile) return BlobComparisonStatus.Unknown;

  if (boilerplateFile.blobSha === forkedFile.blobSha) {
    return BlobComparisonStatus.Identical;
  }

  // Further checks can be added here for content comparison if needed
  return BlobComparisonStatus.Different;
}

/**
 * Determines the likelihood of a conflict based on file sync state
 * and blob content comparison.
 * 
 * @param syncState - The current synchronization state between boilerplate and fork.
 * @param blobStatus - The comparison status of the file contents (blob SHAs).
 * @returns A ConflictLikelihood indicating how likely a conflict will occur.
 */
function getConflictLikelihood(
  syncState: FileSyncState,
  blobStatus: BlobComparisonStatus
): ConflictLikelihood {
  // If file is missing in fork, very likely a conflict
  if (syncState === FileSyncState.Missing) {
    return ConflictLikelihood.High;
  }

  // If files are identical in content and sync state is up-to-date, conflict is very unlikely
  if (syncState === FileSyncState.UpToDate && blobStatus === BlobComparisonStatus.Identical) {
    return ConflictLikelihood.Low;
  }

  // Diverged histories + different blobs → high conflict likelihood
  if (syncState === FileSyncState.Diverged && blobStatus === BlobComparisonStatus.Different) {
    return ConflictLikelihood.High;
  }

  // Unrelated histories usually mean conflict likely
  if (syncState === FileSyncState.Unrelated) {
    return ConflictLikelihood.High;
  }

  // Ahead or Behind with different blobs → medium or high risk
  if ((syncState === FileSyncState.Ahead || syncState === FileSyncState.Behind)
    && blobStatus === BlobComparisonStatus.Different) {
    return ConflictLikelihood.Medium;
  }

  // Outdated sync state with differing blobs → medium risk
  if (syncState === FileSyncState.Outdated && blobStatus === BlobComparisonStatus.Different) {
    return ConflictLikelihood.Medium;
  }

  // If blobs are identical but sync state shows outdated or behind, likely no conflict or low risk
  if ((syncState === FileSyncState.Outdated || syncState === FileSyncState.Behind)
    && blobStatus === BlobComparisonStatus.Identical) {
    return ConflictLikelihood.Low;
  }

  // Default to medium if unsure
  return ConflictLikelihood.Medium;
}

/**
 * Determines the predicted conflict reason based on the file's sync state
 * and blob content comparison between the boilerplate and forked file.
 *
 * @param syncState - The synchronization state of the file.
 * @param blobStatus - The comparison status of the file contents (blobs).
 * @returns A `ConflictReason` enum value indicating why a conflict is expected,
 * or `undefined` if no conflict reason applies.
 */
function getConflictReason(
  syncState: FileSyncState,
  blobStatus: BlobComparisonStatus
): ConflictReason {
  switch (syncState) {
    case FileSyncState.Diverged:
      return ConflictReason.DivergedHistories;

    case FileSyncState.Unrelated:
      return ConflictReason.UnrelatedHistories;

    case FileSyncState.Missing:
      return ConflictReason.MissingInFork;

    case FileSyncState.Behind:
    case FileSyncState.Outdated:
      return ConflictReason.OutdatedInFork;

    case FileSyncState.UpToDate:
    case FileSyncState.Ahead:
      // For these, check if blobs differ (e.g. content mismatch even if commits same)
      if (blobStatus === BlobComparisonStatus.Different) {
        return ConflictReason.BlobMismatch;
      }
      return ConflictReason.None;

    default:
      return ConflictReason.None;
  }
}

/**
 * Determines who can automatically resolve a conflict based on
 * the file synchronization state and blob content comparison.
 *
 * @param syncState - The synchronization state of the file.
 * @param blobStatus - The comparison status of the file contents (blobs).
 * @returns An `AutoResolvable` enum value indicating which system(s)
 * can auto-resolve the conflict.
 */
function getAutoResolvable(
  syncState: FileSyncState,
  blobStatus: BlobComparisonStatus
): AutoResolvable {
  // If file is missing in fork → no git auto-resolve possible here
  if (syncState === FileSyncState.Missing) {
    return AutoResolvable.None;
  }

  // If files are identical, git sees no conflict → git auto-resolve trivially
  if (blobStatus === BlobComparisonStatus.Identical) {
    return AutoResolvable.Git;
  }

  // Git can auto-resolve fast-forward merges
  if (
    syncState === FileSyncState.Ahead ||
    syncState === FileSyncState.Behind
  ) {
    return AutoResolvable.Git;
  }

  // Other cases (diverged, unrelated, outdated) → no auto resolution by Git
  return AutoResolvable.None;
}

/**
 * Determines the resolution strategy for a file conflict based on its
 * synchronization state, conflict likelihood, and auto-resolvability.
 *
 * @param syncState - The current synchronization state between boilerplate and fork.
 * @param conflictLikelihood - The likelihood that a conflict exists.
 * @param autoResolvable - Who can auto-resolve the conflict, if anyone.
 * @returns The selected resolution strategy.
 */
function getResolutionStrategy(
  syncState: FileSyncState,
  conflictLikelihood: ConflictLikelihood,
  autoResolvable: AutoResolvable
): ResolutionStrategy {
  // If conflict unlikely, keep boilerplate
  if (conflictLikelihood === ConflictLikelihood.Low) {
    return ResolutionStrategy.KeepBoilerplate;
  }

  // Handle Ahead/Behind explicitly:
  if (syncState === FileSyncState.Ahead) {
    // Fork is ahead — keep fork changes
    return ResolutionStrategy.KeepFork;
  }

  if (syncState === FileSyncState.Behind) {
    // Fork is behind — keep boilerplate
    return ResolutionStrategy.KeepBoilerplate;
  }

  // If file missing → manual merge needed (user decision)
  if (syncState === FileSyncState.Missing) {
    return ResolutionStrategy.ManualMerge;
  }

  // If git can auto-resolve (fast-forward merges), keep boilerplate
  if (autoResolvable === AutoResolvable.Git) {
    return ResolutionStrategy.KeepBoilerplate;
  }

  // For medium/high conflict likelihood without auto-resolve → manual merge
  if (
    conflictLikelihood === ConflictLikelihood.Medium ||
    conflictLikelihood === ConflictLikelihood.High
  ) {
    return ResolutionStrategy.ManualMerge;
  }

  // Default fallback
  return ResolutionStrategy.Unknown;
}


/**
 * Determines the reason why a particular resolution strategy was chosen.
 *
 * @param syncState - The current synchronization state between boilerplate and fork.
 * @param blobStatus - The comparison status of file blobs (content).
 * @returns The reason for selecting the resolution strategy.
 */
function getResolutionReason(
  syncState: FileSyncState,
  blobStatus: BlobComparisonStatus,
): ResolutionReason {
  switch (syncState) {
    case FileSyncState.Ahead:
      return ResolutionReason.ForkHasNewerCommits;

    case FileSyncState.Behind:
      return ResolutionReason.BoilerplateHasNewerCommits;

    case FileSyncState.UpToDate:
      if (blobStatus === BlobComparisonStatus.Identical) {
        return ResolutionReason.ShouldBeIdentical;
      }
      return ResolutionReason.ShouldBeAutoMerged;

    case FileSyncState.Missing:
      return ResolutionReason.ManualMergeRequired;

    case FileSyncState.Diverged:
    case FileSyncState.Unrelated:
    case FileSyncState.Outdated:
      return ResolutionReason.ManualMergeRequired;

    default:
      return ResolutionReason.Unknown;
  }
}