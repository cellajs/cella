/**
 * The channels a bench attachment lives in below the organization, by row index: one entry per ancestor id column
 * its row needs. The attachment seed stamps them on its rows and the scenarios that create attachments send the
 * deepest one as the home, so an app says it once, here.
 *
 * Empty in the template, whose attachments live in the organization. An app whose attachments live in a channel
 * returns a seeded channel per column, such as `{ projectId: projectId(index % TOTAL_PROJECTS) }`, and moves
 * `attachmentSeedOrder` past the seeds of those channels.
 */
export const benchAttachmentHome = (_index: number): Record<string, string> => ({});

/** Where the attachment seed runs among the seeds: after the seed of every channel `benchAttachmentHome` names. */
export const attachmentSeedOrder = 100;
