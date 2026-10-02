/** Ports between two checkouts of one app. An app shifts its own `devPorts` by tens, so the two never meet. */
const slotSize = 100;

/** Offsets stay below 1000, the distance from the frontend port to the API block. */
const slotCount = 9;

/** Moves the port of a `localhost` URL by `by`; any other URL is returned unchanged. */
export const shiftLocalPort = (url: string, by: number): string =>
  url.replace(/^(\w+:\/\/localhost:)(\d+)/, (_, head: string, port: string) => `${head}${Number(port) + by}`);

/**
 * Claims a slot for `owner`, one file per slot in `slotsDir` holding the owner's path. An owner keeps
 * its slot between runs. A new owner takes the first slot that is free or whose owner no longer
 * exists, else the slot whose stack started longest ago.
 */
export function claimSlot(fs: typeof import('node:fs'), slotsDir: string, owner: string): number {
  fs.mkdirSync(slotsDir, { recursive: true });
  const file = (slot: number) => `${slotsDir}/${slot}`;
  const holderOf = (slot: number) => (fs.existsSync(file(slot)) ? fs.readFileSync(file(slot), 'utf8') : null);
  // Rewriting the file stamps the start time that decides which slot gives way.
  const take = (slot: number) => {
    fs.writeFileSync(file(slot), owner);
    return slot;
  };

  const slots = Array.from({ length: slotCount }, (_, index) => index + 1);
  const own = slots.find((slot) => holderOf(slot) === owner);
  if (own) return take(own);

  const free = slots.find((slot) => {
    const holder = holderOf(slot);
    return !holder || !fs.existsSync(holder);
  });
  if (free) return take(free);

  const startedAt = (slot: number) => fs.statSync(file(slot)).mtimeMs;
  return take(slots.reduce((oldest, slot) => (startedAt(slot) < startedAt(oldest) ? slot : oldest)));
}

/**
 * How far this checkout's dev ports sit from the configured ones. `DEV_PORT_OFFSET` sets it by hand.
 * Unset, the main checkout gets 0 and a linked git worktree claims a slot of its own, so its stack
 * runs beside the main one. Slots live in the shared git directory, where removing a worktree frees
 * its slot.
 */
export function resolveDevPortOffset(): number {
  const explicit = process.env.DEV_PORT_OFFSET;
  if (explicit) {
    const offset = Number(explicit);
    if (!Number.isInteger(offset) || offset < 0)
      throw new Error(`Invalid DEV_PORT_OFFSET "${explicit}": must be a whole number of ports, 0 or higher.`);
    return offset;
  }

  // The browser bundle evaluates this module too and receives the offset through `DEV_PORT_OFFSET`.
  // Node built-ins are looked up at runtime, so the bundle never imports them.
  if (typeof process === 'undefined' || typeof process.getBuiltinModule !== 'function') return 0;
  const fs = process.getBuiltinModule('node:fs');
  const path = process.getBuiltinModule('node:path');
  const { fileURLToPath } = process.getBuiltinModule('node:url');

  try {
    const dotGit = path.join(fileURLToPath(new URL('../../..', import.meta.url)), '.git');
    // A linked worktree's `.git` is a file that points at its directory inside the shared git directory.
    if (!fs.statSync(dotGit).isFile()) return 0;
    const [, pointer] = /^gitdir: (.+)$/m.exec(fs.readFileSync(dotGit, 'utf8')) ?? [];
    if (!pointer) return 0;
    const worktreeGitDir = path.resolve(path.dirname(dotGit), pointer);
    const sharedGitDir = path.resolve(worktreeGitDir, fs.readFileSync(path.join(worktreeGitDir, 'commondir'), 'utf8').trim());
    return claimSlot(fs, path.join(sharedGitDir, 'dev-port-slots'), worktreeGitDir) * slotSize;
  } catch {
    // No git checkout, or a `.git` file that is not a worktree pointer: the configured ports apply.
    return 0;
  }
}
