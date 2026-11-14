// The path hierarchy is the security boundary: an IAM condition grants secret-value reads by `resource.name.startsWith(<path>)`, so where a
// secret lives decides who reads it. Every environment has a Scaleway project of its own, and each rule names that project, so the folders
// start at the project's root.

/**
 * Folder of the values a deploy reads: one container per runtime secret, named by its `secretName`, which the deploy composes into each
 * machine's env file, beside the repository read key and the uploads key's two halves. No machine holds a key that reads it.
 */
export const RUNTIME_FOLDER = '/runtime/';

/** Folder for engine-internal keys: the deploy key's copy and the database passwords. Only the operator reads it. */
export const ENGINE_FOLDER = '/engine/';

/** The deploy key's condition on secret values: the runtime folder, and nothing else. The identity plan compares the live rule with this string. */
export const runtimeFolderCondition = `resource.name.startsWith("${RUNTIME_FOLDER}")`;
