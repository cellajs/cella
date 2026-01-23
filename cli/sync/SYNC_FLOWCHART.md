# Sync CLI Comprehensive Flowchart

This document maps the complete execution flow of the Cella sync CLI, including all possible routes and git commands.

---

## High-Level Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MAIN ENTRY POINT                                │
│                              src/index.ts                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. CAPTURE ORIGINAL BRANCH                                                  │
│    git rev-parse --abbrev-ref HEAD                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. RUN CLI (runCli)                                                         │
│    - Parse CLI args (Commander)                                             │
│    - Prompt for sync service (if not provided)                              │
│    - Apply config overrides from CLI flags                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                        ┌────────────┼────────────┐
                        ▼            ▼            ▼
                   ┌────────┐  ┌─────────┐  ┌──────────┐
                   │ sync   │  │ analyze │  │ validate │
                   └────────┘  └─────────┘  └──────────┘
                        │            │            │
                        │            │            ▼
                        │            │     ┌───────────────────┐
                        │            │     │ validateConfig()  │
                        │            │     │ Exit on error     │
                        │            │     └───────────────────┘
                        │            │
                        ▼            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. VALIDATE CONFIG                                                          │
│    Check that pinned/ignored patterns in cella.config.ts match real files   │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. RUN SETUP (runSetup)                                                     │
│    Preflight checks and repository preparation                              │
│    See: SETUP PHASE DETAILS below                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. RUN ANALYZE (runAnalyze)                                                 │
│    File-by-file comparison between upstream and fork                        │
│    See: ANALYZE PHASE DETAILS below                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                        ┌────────────┴────────────┐
                        ▼                         ▼
                   ┌────────┐               ┌─────────┐
                   │ sync   │               │ analyze │
                   │ service│               │ service │
                   └────────┘               └─────────┘
                        │                         │
                        │                         ▼
                        │                   [Display results & exit]
                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. RUN SYNC (runSync)                                                       │
│    Apply file changes from upstream                                         │
│    See: SYNC PHASE DETAILS below                                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 7. RUN PACKAGES (runPackages)                                               │
│    Sync package.json dependencies (unless --skip-packages)                  │
│    See: PACKAGE SYNC PHASE below                                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 8. SHOW COMMIT MESSAGE                                                      │
│    Display suggested commit message for staged changes                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 9. FINALLY: RESTORE BRANCH                                                  │
│    git checkout <targetBranch>                                              │
│    If started on sync-branch → restore to development                       │
│    Otherwise → restore to original branch                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## SETUP PHASE DETAILS (`runSetup`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SETUP PHASE                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. CONFIG VALIDATION                                                        │
│    Check required properties exist:                                         │
│    - upstream: branchRef, repoReference                                     │
│    - fork: branchRef, syncBranchRef, repoReference                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. VERIFY REPOSITORIES                                                      │
│    checkRepository(upstream): git ls-remote <upstream-url>                  │
│    checkRepository(fork): git rev-parse --is-inside-work-tree               │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. ADD UPSTREAM AS REMOTE                                                   │
│    git remote (check if exists)                                             │
│    IF NOT EXISTS:                                                           │
│      git remote add <upstream-name> <upstream-url>                          │
│    IF URL DIFFERS:                                                          │
│      git remote set-url <upstream-name> <upstream-url>                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. CHECK CLEAN STATE (Working Directory)                                    │
│    git status --porcelain                                                   │
│    Check: .git/MERGE_HEAD (merge in progress)                               │
│    Check: .git/rebase-apply, .git/rebase-merge (rebase in progress)         │
│    FAILS IF: uncommitted changes, ongoing merge, or rebase                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. CHECK CLEAN STATE (Fork Branch)                                          │
│    git branch --format=%(refname:short)                                     │
│    git checkout <forkBranch>                                                │
│    git status --porcelain                                                   │
│    FAILS IF: branch doesn't exist or has uncommitted changes                │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. PREPARE SYNC BRANCH                                                      │
│    git branch --format=%(refname:short)                                     │
│    IF sync-branch DOESN'T EXIST:                                            │
│      git checkout -b <syncBranch> HEAD                                      │
│    git checkout <syncBranch>                                                │
│    git status --porcelain (must be clean)                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 7. FETCH LATEST CHANGES                                                     │
│    git fetch <upstream-remote>                                              │
│    git fetch origin (fork remote)                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 8. COUNT COMMITS & CAPTURE MESSAGES (for squash message later)              │
│    git rev-list --count --no-merges <syncBranch>..<upstreamBranch>          │
│    Store in config.pulledCommitCount                                        │
│                                                                             │
│    git log <syncBranch>..<upstreamBranch> -n <limit> --no-merges            │
│            --pretty=format:%s                                               │
│    Store in config.pulledCommitMessages                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 9. MERGE DEVELOPMENT → SYNC BRANCH (Align with fork)                        │
│    git checkout <syncBranch>                                                │
│    git merge --no-commit --no-edit <developmentBranch>                      │
│    (Should be conflict-free - sync-branch is ancestor of development)       │
│    IF CHANGES: git commit --no-verify -m "Merge..."                         │
│    git status --porcelain (must be clean after)                             │
│                                                                             │
│    ⚠️  NOTE: Upstream merge happens in SYNC phase, not here!                │
│    This allows analyze to see pre-merge state and apply override strategies │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ANALYZE PHASE DETAILS (`runAnalyze`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ANALYZE PHASE                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. GET FILE HASHES FROM UPSTREAM                                            │
│    git ls-tree -r <upstreamBranch>                                          │
│    git log --format=%H --name-only <upstreamBranch>                         │
│    → Returns: FileEntry[] with path, blobSha, lastCommitSha                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. GET FILE HASHES FROM FORK (using syncBranch!)                            │
│    git ls-tree -r <syncBranch>                                              │
│    git log --format=%H --name-only <syncBranch>                             │
│    → Returns: FileEntry[] with path, blobSha, lastCommitSha                 │
│                                                                             │
│    ⚠️  CRITICAL: Uses syncBranch, NOT development branch!                   │
│    syncBranch has actual upstream SHAs for proper ancestry detection        │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. FOR EACH UPSTREAM FILE: analyzeFile()                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
┌──────────────────┐     ┌──────────────────────┐    ┌─────────────────────┐
│ 3a. BLOB STATUS  │     │ 3b. OVERRIDE STATUS  │    │ 3c. COMMIT ANALYSIS │
│ analyzeFileBlob()│     │ getOverrideStatus()  │    │ analyzeFileCommits()│
└──────────────────┘     └──────────────────────┘    └─────────────────────┘
         │                         │                          │
         ▼                         ▼                          ▼
┌──────────────────┐     ┌──────────────────────┐    ┌─────────────────────┐
│ Compare blobSha: │     │ Check cella.config:  │    │ IF blob identical:  │
│ • missing        │     │ • ignored[]          │    │   Skip (upToDate)   │
│ • identical      │     │ • pinned[]           │    │                     │
│ • different      │     │ → Pattern matching   │    │ ELSE: compare       │
│                  │     │                      │    │ commit histories    │
└──────────────────┘     └──────────────────────┘    └─────────────────────┘
                                                              │
                                     ┌────────────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3c-1. GET COMMIT HISTORY (for non-identical files only)                     │
│    Upstream: git log --format=%H|%aI --follow <upstreamBranch> -- <file>    │
│    Fork:     git log --format=%H|%aI --follow <syncBranch> -- <file>        │
│                                                                             │
│    ⚠️  Uses syncBranch because it has actual upstream commit SHAs           │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3c-2. FIND SHARED ANCESTOR                                                  │
│    Compare upstream SHAs with fork (sync-branch) SHAs                       │
│    First matching SHA = shared ancestor                                     │
│                                                                             │
│    RESULTS:                                                                 │
│    • Found ancestor → can calculate ahead/behind                            │
│    • No ancestor → 'unrelated' (first sync or file was never synced)        │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3c-3. CALCULATE STATUS                                                      │
│    • upToDate: ancestor at HEAD, nothing ahead/behind                       │
│    • ahead: fork has commits not in upstream                                │
│    • behind: upstream has commits not in fork                               │
│    • diverged: both have unique commits                                     │
│    • unrelated: no shared ancestor found                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. DETERMINE MERGE STRATEGY: determineFileMergeStrategy()                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          MERGE STRATEGY DECISION TREE                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. overrideStatus === 'ignored'?                                            │
│     └─→ YES: strategy = 'skip-upstream' (skip all upstream changes)         │
│                                                                              │
│  2. blobStatus === 'identical'?                                              │
│     └─→ YES: strategy = 'keep-fork' (nothing to do)                          │
│                                                                              │
│  3. overrideStatus === 'pinned'?                                             │
│     └─→ YES: strategy = 'keep-fork' (always keep fork version)              │
│                                                                              │
│  4. File is NEW (not in fork)?                                               │
│     └─→ YES: strategy = 'keep-upstream' (add new file)                       │
│                                                                              │
│  5. blobStatus === 'different'?                                              │
│     └─→ YES: strategy = 'keep-upstream' (sync to match upstream)            │
│                                                                              │
│  6. Fallback:                                                                │
│     └─→ strategy = 'unknown' (should rarely hit)                            │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## SYNC PHASE DETAILS (`runSync`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYNC PHASE                                      │
│                              runSync() → handleUpstreamIntoForkMerge()       │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. CHECK IF FIRST SYNC                                                      │
│    All files have 'unrelated' commitSummary.status?                         │
│    IF YES: Prompt user "allow unrelated histories?"                         │
│    → Sets allowUnrelatedHistories flag for merge                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. START MERGE: upstream → sync-branch                                      │
│    git checkout <syncBranch>                                                │
│    git merge --no-commit --no-edit [--allow-unrelated-histories]            │
│             <upstreamBranch>                                                │
│                                                                             │
│    ⚠️  --no-commit allows us to resolve conflicts before committing         │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                      ┌──────────────┴──────────────┐
                      ▼                              ▼
               Clean merge                    Has conflicts
                      │                              │
                      ▼                              ▼
               Continue to                    ┌───────────────┐
               step 3                         │ RESOLVE       │
                                              │ CONFLICTS     │
                                              └───────────────┘
                                                     │
           ┌─────────────────────────────────────────┤
           ▼                                         │
┌─────────────────────────────────────────┐          │
│ 2a. RESTORE PROTECTED DELETIONS         │          │
│     git diff --name-only --cached       │          │
│          --diff-filter=D                │          │
│                                         │          │
│     FOR EACH deleted file:              │          │
│       IF ignored OR pinned:             │          │
│         git restore --staged            │          │
│           --source=<developmentBranch>  │          │
│           --worktree -- <file>          │          │
│                                         │          │
│     (Protects fork-specific files from  │          │
│      being deleted by upstream)         │          │
└─────────────────────────────────────────┘          │
                      │                              │
                      ▼                              │
┌─────────────────────────────────────────┐          │
│ 2b. CLEANUP NON-CONFLICTED FILES        │          │
│     git diff --name-only --cached       │          │
│                                         │          │
│     FOR EACH staged file:               │          │
│       IF strategy = 'keep-fork':        │          │
│         git restore --staged            │          │
│           --source=HEAD --worktree      │          │
│           -- <file>                     │          │
│                                         │          │
│       IF strategy = 'skip-upstream':    │          │
│         IF file exists in fork:         │          │
│           git restore --staged (keep)   │          │
│         ELSE (new from upstream):       │          │
│           git rm --cached <file>        │          │
│           git clean -fd <file>          │          │
└─────────────────────────────────────────┘          │
                      │                              │
                      ▼                              │
┌─────────────────────────────────────────┐          │
│ 2c. RESOLVE MERGE CONFLICTS             │◀─────────┘
│     git diff --name-only --diff-filter=U│
│                                         │
│     FOR EACH unmerged file:             │
│       IF strategy = 'keep-fork':        │
│         git checkout --ours <file>      │
│         git add <file>                  │
│                                         │
│       IF strategy = 'skip-upstream':    │
│         IF file exists in fork:         │
│           git checkout --ours (keep)    │
│         ELSE (new from upstream):       │
│           git rm --cached <file>        │
│           git clean -fd <file>          │
│                                         │
│     CHECK remaining conflicts:          │
│       git diff --name-only --diff-filter=U
│                                         │
│     IF STILL HAS CONFLICTS:             │
│       Prompt user: "resolve manually"   │
│       Wait for user confirmation        │
│       git add -A                        │
└─────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2d. CLEANUP UNTRACKED FILES                                                 │
│     git clean -fd                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. COMMIT MERGE (if changes exist)                                          │
│    git status --porcelain                                                   │
│    IF has changes:                                                          │
│      git commit --no-verify -m "Merge <upstream> into <syncBranch>"         │
└─────────────────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. SQUASH MERGE: sync-branch → development (handleSquashMerge)              │
│    git checkout <developmentBranch>                                         │
│                                                                             │
│    Check commits ahead:                                                     │
│    git rev-list --count --no-merges <developmentBranch>..<syncBranch>       │
│    IF 0 commits: Return null (nothing to sync)                              │
│                                                                             │
│    git merge --squash --strategy-option=theirs <syncBranch>                 │
│    (acceptTheirs because sync-branch has correctly resolved content)        │
│    IF CONFLICTS: Prompt user to resolve manually                            │
│    git add -A                                                               │
│                                                                             │
│    git status --porcelain                                                   │
│    IF no staged changes: Return null                                        │
│                                                                             │
│    Generate commit message using:                                           │
│    config.pulledCommitMessages (captured in setup, before any merges)       │
│                                                                             │
│    ⚠️  Changes are STAGED but NOT COMMITTED                                 │
│    User reviews and commits manually                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                      │
                      ▼
                   RETURN
              commit message
```

---

## PACKAGE SYNC PHASE DETAILS (`runPackages`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PACKAGE SYNC PHASE                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. CHECKOUT DEVELOPMENT BRANCH                                              │
│    git checkout <developmentBranch>                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. FOR EACH package.json FILE (not ignored):                                │
│    Read local: fs.readFileSync(<forkPath>/package.json)                     │
│    Read upstream: git show <upstreamBranch>:package.json                    │
│                                                                             │
│    Compare configured keys (config.packageJsonSync):                        │
│    • dependencies                                                           │
│    • devDependencies                                                        │
│    • peerDependencies                                                       │
│    • engines                                                                │
│    • ... (configurable)                                                     │
│                                                                             │
│    Apply updates from upstream → fork                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. WRITE UPDATED package.json FILES                                         │
│    fs.writeFileSync(<forkPath>/package.json, updatedContent)                │
│    git add -A                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ALL GIT COMMANDS USED

### Repository Inspection
```bash
git rev-parse --abbrev-ref HEAD              # Get current branch name
git rev-parse --is-inside-work-tree          # Check if in git repo
git ls-remote <remote-url>                   # Check remote accessibility
git status --porcelain                       # Check for uncommitted changes
```

### Branch Operations
```bash
git branch --format=%(refname:short)         # List local branches
git branch -r --format=%(refname:short)      # List remote branches
git checkout <branch>                        # Switch branches
git checkout -b <newBranch> <baseBranch>     # Create new branch
```

### Remote Operations
```bash
git remote                                   # List remotes
git remote add <name> <url>                  # Add remote
git remote set-url <name> <url>              # Update remote URL
git remote get-url <name>                    # Get remote URL
git fetch <remote>                           # Fetch from remote
```

### File Inspection
```bash
git ls-tree -r <branch>                      # List all files with blob SHAs
git log --format=%H --name-only <branch>     # Get commit→file mappings
git log --format=%H|%aI --follow <branch> -- <file>  # File commit history
git log -n 1 --format=%H <branch> -- <file>  # Last commit for file
git show <commit>:<file>                     # Get file content at commit
```

### Merge Operations
```bash
git merge <branch>                           # Standard merge
git merge --no-commit --no-edit <branch>     # Merge without committing
git merge --squash <branch>                  # Squash merge
git merge --allow-unrelated-histories <branch>  # Allow unrelated histories
```

### Conflict Resolution
```bash
git diff --name-only --diff-filter=U         # List unmerged (conflicted) files
git diff --name-only --cached                # List staged files
git diff --name-only --cached --diff-filter=D  # List staged deletions
git checkout --ours <file>                   # Keep our version
git restore --staged --source=HEAD --worktree -- <file>  # Restore from HEAD
git restore --staged --source=<ref> --worktree -- <file>  # Restore from ref
git rm --cached <file>                       # Remove from index only
git clean -fd <file>                         # Remove untracked file
git clean -fd                                # Remove all untracked files
```

### Commit Operations
```bash
git add <file>                               # Stage file
git add -A                                   # Stage all changes
git commit -m "<message>"                    # Create commit
git commit --no-verify -m "<message>"        # Commit skipping hooks
git rev-list --count --no-merges <base>..<source>  # Count commits between refs
git log <base>..<source> -n <limit> --no-merges --pretty=format:%s  # Commit messages
git merge-base <branch1> <branch2>           # Find common ancestor
```

### State Detection
```bash
# Check for .git/MERGE_HEAD                  # Merge in progress
# Check for .git/rebase-apply                # Rebase in progress
# Check for .git/rebase-merge                # Rebase in progress
```

---
