# Quickstart

This document describes how to develop your own app based on Cella, after forking it.

Also read the [architecture](./ARCHITECTURE.md) info.

-- Quickstart will soon be finished. We will be working on a `pnpm create` script to make it easy to get started

---

# Quickstart Guide for Cella Scripts

This guide will help you use the two scripts, **list diverged files** and **pull upstream**, to manage changes in your Cella project.

## 1. List Divergent Files

The `list-diverged-files.sh` script lists all files that have diverged from the upstream `cella` repository and writes the output to `cella.config.changed_files`.
It only includes changed files that are present in both your development branch and the upstream repository.
Additionally, files specified in `cella.config.ignore_file` will be excluded from the results.

### Prerequisites

Before running the script, ensure it is executable:

```bash
chmod +x path/to/list-diverged-files.sh
```

### Set Up Upstream Repository

Point your upstream to the Cella repository:

```bash
git remote add upstream https://github.com/cellajs/cella.git
```

### Run the Script

Execute the script using `pnpm`:

```bash
pnpm run list-diverged-files
```

## 2. Pull Upstream

The `pull-upstream.sh` script fetches and merges changes from the upstream `cella` repository.
It will skip files listed in `cella.config.ignore_file` to help prevent endless merge conflicts.

### Prerequisites

Before running the script, ensure it is executable:

```bash
chmod +x path/to/pull-upstream.sh
```

### Set Up Upstream Repository

If you haven't already, point your upstream to the Cella repository:

```bash
git remote add upstream https://github.com/cellajs/cella.git
```

### Run the Script

Execute the script using `pnpm`:

```bash
pnpm run pull-upstream
```
