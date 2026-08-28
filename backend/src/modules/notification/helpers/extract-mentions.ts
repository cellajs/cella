// Two body shapes exist because editors differ: BlockNote stores mentions as inline content
// nodes in its JSON document, while HTML bodies carry them as a span with a data attribute.
const HTML_MENTION_PATTERN = /data-mention-id=["']([0-9a-f-]{36})["']/gi;

/** Ids are UUIDs; anything else is a malformed or hand-written payload and is dropped. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null;

/** Walks arbitrary BlockNote JSON, collecting `{ type: 'mention', props: { id } }` nodes at any depth. */
function collectFromBlocks(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) collectFromBlocks(child, into);
    return;
  }
  if (!isRecord(node)) return;

  if (node.type === 'mention' && isRecord(node.props)) {
    const id = node.props.id;
    if (typeof id === 'string' && UUID_PATTERN.test(id)) into.add(id);
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value) || isRecord(value)) collectFromBlocks(value, into);
  }
}

/**
 * Extract mentioned user ids from a stored body, server-side: trusting a client-posted array
 * would let anyone notify anyone, so ids are re-derived here and permission-filtered by the
 * caller. Returns unique ids in document order; never throws, because a malformed body must not
 * fail the write it is derived from.
 */
export function extractMentionIds(body: string | null | undefined): string[] {
  if (!body) return [];

  const found = new Set<string>();

  const trimmed = body.trimStart();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      collectFromBlocks(JSON.parse(body), found);
    } catch {
      // Not JSON after all; fall through to the HTML scan.
    }
  }

  for (const match of body.matchAll(HTML_MENTION_PATTERN)) {
    const id = match[1];
    if (id && UUID_PATTERN.test(id)) found.add(id.toLowerCase());
  }

  return [...found];
}
