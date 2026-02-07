#!/usr/bin/env npx tsx
/**
 * Script to convert bottom-of-file exports to inline exports.
 * Transforms: `function Foo() {}` + `export { Foo };` → `export function Foo() {}`
 *
 * Usage: npx tsx scripts/fix-exports.ts [--dry-run]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

const SRC_DIR = path.join(import.meta.dirname, '../src');

// File patterns to process
const FILE_EXTENSIONS = ['.ts', '.tsx'];

// Directories/files to skip
const SKIP_PATTERNS = [
  'api.gen', // Generated files
  '.test.', // Test files
  '.stories.', // Storybook files
  'node_modules',
];

interface ExportInfo {
  names: string[];
  line: number;
  fullMatch: string;
}

/**
 * Strips all comments from source code for analysis purposes.
 * Handles single-line (//), block, and JSDoc comments.
 */
function stripComments(content: string): string {
  let result = '';
  let i = 0;
  const len = content.length;

  while (i < len) {
    // Check for string literals (don't strip "comments" inside strings)
    if (content[i] === '"' || content[i] === "'" || content[i] === '`') {
      const quote = content[i];
      result += content[i++];

      while (i < len && content[i] !== quote) {
        // Handle escape sequences
        if (content[i] === '\\' && i + 1 < len) {
          result += content[i++];
          result += content[i++];
        } else {
          // Handle template literal expressions
          if (quote === '`' && content[i] === '$' && content[i + 1] === '{') {
            let braceDepth = 1;
            result += content[i++]; // $
            result += content[i++]; // {
            while (i < len && braceDepth > 0) {
              if (content[i] === '{') braceDepth++;
              else if (content[i] === '}') braceDepth--;
              result += content[i++];
            }
          } else {
            result += content[i++];
          }
        }
      }
      if (i < len) result += content[i++]; // closing quote
    }
    // Check for single-line comment
    else if (content[i] === '/' && content[i + 1] === '/') {
      // Skip until end of line
      while (i < len && content[i] !== '\n') i++;
    }
    // Check for block comment (/* */ or /** */)
    else if (content[i] === '/' && content[i + 1] === '*') {
      i += 2; // Skip /*
      while (i < len && !(content[i] === '*' && content[i + 1] === '/')) {
        // Preserve newlines to keep line structure
        if (content[i] === '\n') result += '\n';
        i++;
      }
      i += 2; // Skip */
    }
    // Regular character
    else {
      result += content[i++];
    }
  }

  return result;
}

/**
 * Get non-empty code lines (excluding comments and blank lines).
 */
function getCodeLines(content: string): string[] {
  const stripped = stripComments(content);
  return stripped.split('\n').filter((l) => l.trim());
}

function isBarrelFile(content: string, filePath: string): boolean {
  const fileName = path.basename(filePath);
  const codeLines = getCodeLines(content);

  // index files are often barrel files
  if (fileName === 'index.ts' || fileName === 'index.tsx') {
    // Check if it's primarily re-exports
    const exportFromLines = codeLines.filter((l) => l.includes('export') && l.includes('from'));
    // If more than 50% are re-exports, it's a barrel file
    if (exportFromLines.length > codeLines.length * 0.5) {
      return true;
    }
  }

  // Check if the file only contains export statements (pure barrel)
  const allExportsFrom = codeLines.every(
    (l) => l.trim().startsWith('export') && l.includes('from')
  );

  return allExportsFrom && codeLines.length > 0;
}

function shouldSkipFile(filePath: string): boolean {
  return SKIP_PATTERNS.some((pattern) => filePath.includes(pattern));
}

function findBottomExports(content: string): ExportInfo[] {
  const exports: ExportInfo[] = [];

  // Match ONLY single-line exports: export { Name1, Name2 };
  // Must have opening and closing brace on the same line
  // But NOT: export { ... } from '...'; (re-exports)
  const exportRegex = /^export\s*\{([^}\n]+)\}\s*;?\s*$/gm;

  let match: RegExpExecArray | null;
  while ((match = exportRegex.exec(content)) !== null) {
    const fullMatch = match[0];

    // Skip if it's a re-export (has 'from')
    if (fullMatch.includes('from')) continue;

    // Skip if contains 'type' keyword (type exports)
    if (fullMatch.includes('type ')) continue;

    const line = content.substring(0, match.index).split('\n').length;

    // Parse exported names, handling 'as' aliases
    const namesStr = match[1];
    const names = namesStr
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n)
      .map((n) => {
        // Handle "OriginalName as ExportedName" - we want OriginalName
        const asMatch = n.match(/^(\w+)\s+as\s+\w+$/);
        return asMatch ? asMatch[1] : n;
      });

    // Skip if any name contains 'as' alias (too complex)
    if (namesStr.includes(' as ')) continue;

    exports.push({ names, line, fullMatch });
  }

  // Only process if there's exactly ONE bottom export statement
  if (exports.length !== 1) {
    return [];
  }

  return exports;
}

function addExportToDeclaration(content: string, name: string): string {
  // Patterns to match declarations that should get 'export' added
  const patterns = [
    // function Name(
    new RegExp(`^(\\s*)(function\\s+${name}\\s*[(<])`, 'gm'),
    // async function Name(
    new RegExp(`^(\\s*)(async\\s+function\\s+${name}\\s*[(<])`, 'gm'),
    // const Name =
    new RegExp(`^(\\s*)(const\\s+${name}\\s*=)`, 'gm'),
    // let Name =
    new RegExp(`^(\\s*)(let\\s+${name}\\s*=)`, 'gm'),
    // class Name (handles: class Foo {, class Foo<T>, class Foo extends ...)
    new RegExp(`^(\\s*)(class\\s+${name}\\s*[{<])`, 'gm'),
    new RegExp(`^(\\s*)(class\\s+${name}\\s+extends\\s)`, 'gm'),
    new RegExp(`^(\\s*)(class\\s+${name}\\s+implements\\s)`, 'gm'),
    // interface Name
    new RegExp(`^(\\s*)(interface\\s+${name}\\s*[{<])`, 'gm'),
    new RegExp(`^(\\s*)(interface\\s+${name}\\s+extends\\s)`, 'gm'),
    // type Name =
    new RegExp(`^(\\s*)(type\\s+${name}\\s*=)`, 'gm'),
    // enum Name
    new RegExp(`^(\\s*)(enum\\s+${name}\\s*\\{)`, 'gm'),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(content);
    if (match) {
      // Check if already exported
      const lineStart = content.lastIndexOf('\n', match.index) + 1;
      const lineContent = content.substring(lineStart, match.index + match[0].length);

      if (!lineContent.includes('export')) {
        // Add export keyword
        content = content.replace(pattern, '$1export $2');
        return content;
      }
    }
  }

  return content;
}

function processFile(filePath: string): { modified: boolean; changes: string[] } {
  const changes: string[] = [];

  let content = fs.readFileSync(filePath, 'utf-8');

  // Skip barrel files
  if (isBarrelFile(content, filePath)) {
    if (VERBOSE) console.log(`  Skipping barrel file: ${filePath}`);
    return { modified: false, changes };
  }

  const bottomExports = findBottomExports(content);

  if (bottomExports.length === 0) {
    return { modified: false, changes };
  }

  // Collect all names to export inline
  const allNames = bottomExports.flatMap((e) => e.names);

  // Add export to each declaration
  for (const name of allNames) {
    const newContent = addExportToDeclaration(content, name);
    if (newContent !== content) {
      content = newContent;
      changes.push(`Added 'export' to ${name}`);
    }
  }

  // Remove bottom export statements
  for (const exp of bottomExports) {
    const escapedMatch = exp.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const removeRegex = new RegExp(`\\n?${escapedMatch}\\s*`, 'g');
    const beforeLength = content.length;
    content = content.replace(removeRegex, '');
    if (content.length !== beforeLength) {
      changes.push(`Removed bottom export: ${exp.fullMatch.trim()}`);
    }
  }

  // Clean up trailing whitespace
  content = content.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';

  if (changes.length > 0 && !DRY_RUN) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  return { modified: changes.length > 0, changes };
}

function walkDirectory(dir: string): string[] {
  const files: string[] = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!shouldSkipFile(fullPath)) {
        files.push(...walkDirectory(fullPath));
      }
    } else if (entry.isFile()) {
      if (FILE_EXTENSIONS.some((ext) => entry.name.endsWith(ext)) && !shouldSkipFile(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function main() {
  console.log(`\n🔧 Export Fixer Script`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`   Directory: ${SRC_DIR}\n`);

  const files = walkDirectory(SRC_DIR);
  let modifiedCount = 0;

  for (const file of files) {
    const relativePath = path.relative(SRC_DIR, file);
    const { modified, changes } = processFile(file);

    if (modified) {
      modifiedCount++;
      console.log(`✅ ${relativePath}`);
      for (const change of changes) {
        console.log(`   - ${change}`);
      }
    } else if (VERBOSE) {
      console.log(`⏭️  ${relativePath} (no changes)`);
    }
  }

  console.log(`\n📊 Summary: ${modifiedCount} file(s) ${DRY_RUN ? 'would be' : ''} modified\n`);

  if (DRY_RUN && modifiedCount > 0) {
    console.log('   Run without --dry-run to apply changes\n');
  }
}

main();
