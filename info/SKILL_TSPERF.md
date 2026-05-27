# TypeScript performance diagnostics

Guide for diagnosing slow TypeScript type-checking in this monorepo.

## Quick commands

```bash
# Per-package timing (tsgo)
pnpm -r --filter '!raak' ts

# Extended diagnostics for a single package
npx tsgo -p <package>/tsconfig.json --extendedDiagnostics

# List all files in compilation
npx tsgo -p <package>/tsconfig.json --listFiles

# Generate detailed trace (tsc only, not tsgo)
npx tsc -p <package>/tsconfig.json --noEmit --generateTrace /tmp/<name>-trace
```

## Key metrics from `--extendedDiagnostics`

| Metric | What it means |
|--------|---------------|
| Files | Total files in compilation (source + node_modules types) |
| Types | Number of TypeScript types created |
| Instantiations | Generic type instantiations (main cost driver) |
| Check time | Time spent type-checking (the bottleneck) |

**Red flags**: Types > 500K, Instantiations > 2M, or Check time > 2s for a small package.

## Diagnosing with `--listFiles`

Count source vs node_modules files to see if a package pulls in too many transitive types:

```bash
npx tsgo -p <pkg>/tsconfig.json --listFiles 2>&1 | grep -v "node_modules" | wc -l  # source files
npx tsgo -p <pkg>/tsconfig.json --listFiles 2>&1 | grep "node_modules" | wc -l     # type definition files
```

Find which node_modules packages contribute most files:

```bash
npx tsgo -p <pkg>/tsconfig.json --listFiles 2>&1 \
  | grep "node_modules" \
  | sed 's|.*/node_modules/||' \
  | cut -d/ -f1-2 | sort | uniq -c | sort -rn | head -20
```

## Diagnosing with `--generateTrace`

The trace produces Chrome Tracing format JSON. Analyze per-file check times with this Python script:

```python
import json, sys

with open(sys.argv[1]) as f:
    data = json.load(f)

stack = {}
durations = []
for e in data:
    name, ph = e.get('name', ''), e.get('ph', '')
    if name == 'checkSourceFile':
        path = e.get('args', {}).get('path', '').lower()
        if ph == 'B':
            stack[path] = e['ts']
        elif ph == 'E' and path in stack:
            durations.append((e['ts'] - stack.pop(path), path))

durations.sort(reverse=True)
for dur, path in durations[:30]:
    print(f'  {dur/1000:8.1f}ms  {path}')
```

Note: tsc lowercases all paths in the trace output.

## Common causes of slow type-checking

### 1. Over-broad `include` in tsconfig.json

A package's `include` array may pull in files it doesn't actually import. The TypeScript compiler must parse and check **every file in `include`**, plus everything those files transitively import from `node_modules`.

**Example**: CDC's tsconfig included `../backend/src/**/*` (355 files + 3,500 transitive node_modules type files) even though CDC only imports 3 backend modules via `#/` path aliases. tsgo resolves path-aliased imports on demand without needing them in `include`.

**Fix**: Narrow `include` to only the package's own source files. Path aliases (`paths` in compilerOptions) still resolve correctly — they don't need to be in `include`.

### 2. Heavy library types in node_modules

Some libraries contribute hundreds of type files. Check with `--listFiles` (see above). Common heavy ones in this repo: `@base-ui/react` (361 files), `@sentry/core` (212), `@blocknote` (269), `recharts` (123), `@getbrevo/brevo` (768).

These can't easily be removed but explain baseline costs. `skipLibCheck: true` helps (already set in root tsconfig).

### 3. Complex generic instantiations

Drizzle ORM handlers with complex select shapes, Hono route types, and TanStack Router/Query generics create deep type instantiation chains. These show up as high `Instantiations` counts and long `structuredTypeRelatedTo` events in traces.

## Baseline numbers (March 2026)

| Package | Files | Types | Instantiations | Check time (tsgo) |
|---------|-------|-------|---------------|-------------------|
| frontend | 3,972 | 680K | 3.7M | 4.5s |
| backend | 4,120 | 435K | 1.3M | 0.6s |
| CDC | 4,032 | 946K | 3.6M | 1.2s (15s tsc) |
| CDC (narrowed) | 1,105 | 55K | 112K | 0.07s |
| yjs | 394 | 19K | 25K | 0.02s |
| sdk | 408 | 356 | 0 | 0.00s |
| shared | ~400 | ~20K | ~25K | ~0.02s |

CDC's inflated numbers are entirely caused by including `../backend/src/**/*` in its tsconfig `include`.
