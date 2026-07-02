/**
 * Extract the indented lines of a top-level YAML block (e.g. `overrides:`).
 * Stops at the next non-indented, non-empty line. Comment lines are skipped.
 */
function yamlBlockLines(content: string, key: string): string[] {
  const lines: string[] = [];
  let inBlock = false;

  for (const line of content.split('\n')) {
    if (new RegExp(`^${key}:\\s*$`).test(line)) {
      inBlock = true;
      continue;
    }
    if (!inBlock) continue;

    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;
    // End of block: non-indented non-empty line (next top-level key)
    if (trimmed !== '' && !line.startsWith(' ') && !line.startsWith('\t')) break;
    lines.push(line);
  }

  return lines;
}

/**
 * Parse a top-level YAML block of flat `key: value` entries into a record.
 * Quotes around keys and values are stripped.
 */
export function parseYamlBlockMap(content: string, key: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of yamlBlockLines(content, key)) {
    const match = line.match(/^\s+(.+?):\s+['"]?([^'"]+)['"]?\s*$/);
    if (match) {
      result[match[1].replace(/^['"]|['"]$/g, '')] = match[2];
    }
  }
  return result;
}

/**
 * Parse a top-level YAML block of `- item` list entries into an array.
 */
export function parseYamlBlockList(content: string, key: string): string[] {
  const items: string[] = [];
  for (const line of yamlBlockLines(content, key)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) items.push(trimmed.slice(2).trim());
  }
  return items;
}
