/**
 * Codemod: locale keys follow the families in locales/README.md, and a key lowercases the noun in its slot itself.
 *
 * `rewrite`:
 *   - renames the keys in RENAMES in every string of a .ts or .tsx file, and in each language's app.json (a plural form
 *     moves with its key);
 *   - drops `.toLowerCase()` on a translated value passed into a slot the key writes as `{{slot, lowercase}}`;
 *   - copies a removed template key the app still calls into locales/en/app.json, with the text it had.
 * `inventory` reports the same, plus calls of replaced keys whose successor takes other values (`judge` lines).
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/alignments/<id>/locale-patterns.ts inventory frontend/src backend/src
 *   pnpm exec tsx cella/alignments/<id>/locale-patterns.ts rewrite   frontend/src backend/src
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import ts from 'typescript';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.turbo', 'gen']);

/** Old key to new key, both with namespace; the values a call passes stay the same. */
const RENAMES: Record<string, string> = {
  'c:delete_confirm.text': 'c:confirm.delete_resource',
  'c:confirm.delete_counted_resource': 'c:confirm.delete_resource_counted',
  'c:success.archived_resource': 'c:success.archive_resource',
  'c:success.resource_copied': 'c:success.copy_resource',
  'c:success.published_resource': 'c:success.publish_resource',
  'c:success.resource_count_invited': 'c:success.invite_resource_counted',
  'c:message_sent.text': 'c:success.send_message',
  'c:docs.search.placeholder': 'c:placeholder.search_docs',
  'c:paste_emails.placeholder': 'c:placeholder.paste_emails',
  'c:mfa_enable_confirmation.text': 'c:confirm.enable_mfa',
  'c:mfa_disable_confirmation.text': 'c:confirm.disable_mfa',
  'c:explain.invite_bulk.text': 'c:invite_bulk.text',
  'c:explain.invite_email.text': 'c:invite_email.text',
  'c:explain.invite_search.text': 'c:invite_search.text',
  'c:leave_message.text': 'c:leave_message',
  'c:schedule_call.text': 'c:schedule_call',
  'c:entered_focus.text': 'c:entered_focus',
  'c:left_focus.text': 'c:left_focus',
  'c:totp_manual.title': 'c:totp_manual',
  'c:totp_manual.description': 'c:totp_manual.text',
  'c:totp_qr.title': 'c:totp_qr',
  'c:totp_qr.description': 'c:totp_qr.text',
  'c:totp_qr.expired': 'c:totp_qr_expired.text',
  'c:mfa_header': 'c:mfa',
  'c:mfa_subheader.text': 'c:mfa_step.text',
  'c:request_verification.legal_notice': 'c:legal_notice_verify.text',
  'c:child_page': 'c:child_page_count',
  'c:matches': 'c:match_count',
  'c:invite_result_added_member': 'c:invite_result_added_directly',
  'c:invite_result_added_many': 'c:invite_result_added_directly_counted',
  'c:invite_result_declined_many': 'c:invite_result_declined_counted',
  'c:invite_result_members': 'c:invite_result_member_counted',
};

/** Keys the template dropped without a successor, with their last en text, for an app that still calls them. */
const REMOVED: Record<string, string> = {
  admins: 'Admins',
  assign_to: 'Assign to',
  assigned_to: 'Assigned to',
  bio: 'Bio',
  branch: 'Branch',
  checkout: 'Checkout',
  commit: 'Commit',
  content_type: 'Content type',
  deploying: 'Deploying...',
  deployment: 'Deployment',
  deployment_other: 'Deployments',
  disconnect: 'Disconnect',
  emails: 'Emails',
  enabled: 'Enabled',
  enforce: 'Enforce',
  errors: 'Errors',
  for: 'for',
  go_to_project: 'Go to project',
  go_to_workspace: 'Go to workspace',
  hosting: 'Hosting',
  import: 'Import',
  in_waitlist: '{{appName}} will soon contact you for early access!',
  institution: 'Institution',
  items: 'Items',
  manage: 'Manage',
  memberships: 'Memberships',
  plan: 'Plan',
  rollback: 'Rollback',
  saving: 'Saving...',
  storage: 'Storage',
  subitem: 'Subitem',
  subitems: 'Subitems',
  synced: 'Synced',
  syncing: 'Syncing',
  unpublished: 'Unpublished',
  unselected: 'Unselected',
  verify_my_email: 'Verify my email',
};

/** Replaced keys whose successor takes other values, matched in source, with what to write. */
const REPLACED: [RegExp, string][] = [
  [/c:success\.update_item\b/, "c:success.update_resource with { resource } (was { item })"],
  [/c:success\.delete_counted_resources\b/, 'c:success.delete_resource_counted with { count, resource: t(type, { count }) } (was { resources })'],
  [/c:success\.you_left_entity\b/, 'c:success.leave_channel with { name: channel.name } (was { entity })'],
  [/c:success\.(passkey|totp)_added\b/, "c:success.add_resource with { resource: t('c:passkey') } or t('c:totp')"],
  [/c:upload_item\b/, 'c:upload_resource with { resource } (was { item }); c:upload_multiple.text takes { resource } too'],
  [/c:invitation_settled\b/, 'c:success.accept_invitation or c:success.reject_invitation'],
  [/c:request_verification\.(text|connect|invite|signin|signup)\b|c:request_verification\.\$\{/, 'c:request_verification.<reason>.text, one whole sentence per reason with { provider }'],
  [/c:found\b/, 'c:resource_count_found with { count, resource } (or c:resource_count without "found")'],
  [/c:ago\b/, "c:time_ago with { time }"],
  [/c:item'\s*,\s*\{\s*count/, 'c:item_count with { count } for "3 items"; c:item stays the label'],
  [/c:docs\.no_pages_yet\b/, "c:no_resource_yet with { resource: t('c:page_other') }"],
  [/c:mfa_\$\{/, 'c:confirm.enable_mfa / c:confirm.disable_mfa'],
  [/c:success\.\$\{[^}]*'archived'/, "c:success.archive_resource (was archived_resource)"],
  [/c:email\.(comment|mention|reply)\.preview\b/, "previewText: param('subjectTitle'); the preview keys are gone"],
  [/companyName:/, 'c:credits takes { company }, or nothing: appName and company are default values'],
  [/resourceLowerCase/, '{{resource, lowercase}} in the key; pass resource in its label form'],
  [/providerName:/, 'backend:email.oauth_verification.* take { provider }'],
];

const quote = `['"\`]`;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const renameRegex = (key: string) => new RegExp(`(${quote})${escape(key)}(?=${quote})`, 'g');

/** Recursively collect .ts and .tsx files under a root, skipping generated and vendored folders. */
function collect(root: string, out: string[]): void {
  if (!statSync(root).isDirectory()) {
    out.push(root);
    return;
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(full, out);
    } else if (['.ts', '.tsx'].includes(extname(entry.name)) && !/\.(?:d|gen)\.tsx?$/.test(entry.name)) out.push(full);
  }
}

const readJson = (path: string): Record<string, string> => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {});
const writeJson = (path: string, data: Record<string, string>) => {
  const sorted = Object.fromEntries(Object.entries(data).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
};

/** The en text of every key, by namespace, as this checkout resolves it (app files read over template files). */
function enTexts(): Record<string, Record<string, string>> {
  const en = (file: string) => readJson(join('locales', 'en', `${file}.json`));
  return {
    c: { ...en('common'), ...en('app') },
    error: { ...en('error'), ...en('appError') },
    backend: en('backend'),
  };
}

/** The slots a key's en text lowercases itself. */
function lowercaseSlots(texts: ReturnType<typeof enTexts>, fullKey: string): Set<string> {
  const [ns, ...rest] = fullKey.split(':');
  const key = rest.join(':');
  const candidates = [key, `${key}_one`, `${key}_other`].map((k) => texts[ns]?.[k] ?? '');
  return new Set(candidates.flatMap((text) => [...text.matchAll(/\{\{\s*(\w+)\s*,\s*lowercase\s*\}\}/g)].map((m) => m[1])));
}

const isTCall = (node: ts.Node): node is ts.CallExpression =>
  ts.isCallExpression(node) &&
  ((ts.isIdentifier(node.expression) && node.expression.text === 't') ||
    (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 't'));

const keyOf = (node: ts.Node | undefined) =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /^(c|error|backend):/.test(node.text) ? node.text : undefined;

/** `.toLowerCase()` calls on a translated value inside the options a lowercasing key receives, as [start, end, inner]. */
function redundantLowercase(file: string, source: string, texts: ReturnType<typeof enTexts>): [number, number, string][] {
  const src = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits: [number, number, string][] = [];
  const inspect = (key: string, options: ts.ObjectLiteralExpression) => {
    const slots = lowercaseSlots(texts, key);
    for (const property of options.properties) {
      if (!ts.isPropertyAssignment(property) || !slots.has(property.name.getText(src))) continue;
      const value = property.initializer;
      if (!ts.isCallExpression(value) || !ts.isPropertyAccessExpression(value.expression)) continue;
      if (value.expression.name.text !== 'toLowerCase' || !isTCall(value.expression.expression)) continue;
      edits.push([value.getStart(src), value.getEnd(), value.expression.expression.getText(src)]);
    }
  };
  src.forEachChild(function visit(node: ts.Node): void {
    if (isTCall(node)) {
      const key = keyOf(node.arguments[0]);
      const options = node.arguments[1];
      if (key && options && ts.isObjectLiteralExpression(options)) inspect(key, options);
    } else if (ts.isJsxAttributes(node)) {
      // A component that translates for its caller: title="c:key" with titleOptions={{ ... }}, i18nKey with values
      const attributes = node.properties.filter(ts.isJsxAttribute);
      const key = attributes.map((attribute) => keyOf(attribute.initializer)).find(Boolean);
      if (key) {
        for (const attribute of attributes) {
          const expression = attribute.initializer && ts.isJsxExpression(attribute.initializer) ? attribute.initializer.expression : undefined;
          if (expression && ts.isObjectLiteralExpression(expression)) inspect(key, expression);
        }
      }
    }
    node.forEachChild(visit);
  });
  return edits;
}

function rewriteSource(file: string, source: string, texts: ReturnType<typeof enTexts>, changes: string[]): string {
  let next = source;
  for (const [from, to] of Object.entries(RENAMES)) {
    next = next.replace(renameRegex(from), (_match, mark: string) => {
      changes.push(`${from} -> ${to}`);
      return `${mark}${to}`;
    });
  }
  const edits = redundantLowercase(file, next, texts).sort(([a], [b]) => b - a);
  for (const [start, end, inner] of edits) {
    changes.push(`drop .toLowerCase() on ${inner}`);
    next = `${next.slice(0, start)}${inner}${next.slice(end)}`;
  }
  return next;
}

/** Renames the overrides in each language's app.json; a plural form moves with its key. */
function rewriteAppLocales(apply: boolean): string[] {
  const changes: string[] = [];
  if (!existsSync('locales')) return changes;
  for (const language of readdirSync('locales')) {
    const path = join('locales', language, 'app.json');
    const data = readJson(path);
    let changed = false;
    for (const [from, to] of Object.entries(RENAMES)) {
      if (!from.startsWith('c:')) continue;
      const [oldKey, newKey] = [from.slice(2), to.slice(2)];
      for (const suffix of ['', '_one', '_other']) {
        if (!(`${oldKey}${suffix}` in data)) continue;
        data[`${newKey}${suffix}`] = data[`${oldKey}${suffix}`];
        delete data[`${oldKey}${suffix}`];
        changes.push(`${path}: ${oldKey}${suffix} -> ${newKey}${suffix}`);
        changed = true;
      }
    }
    if (apply && changed) writeJson(path, data);
  }
  return changes;
}

/** Removed template keys the scanned code still calls and app.json lacks, copied into locales/en/app.json. */
function restoreRemoved(sources: string, apply: boolean): string[] {
  const path = join('locales', 'en', 'app.json');
  const app = readJson(path);
  const template = readJson(join('locales', 'en', 'common.json'));
  const missing = Object.entries(REMOVED).filter(
    ([key]) => !(key in app) && !(key in template) && renameRegex(`c:${key}`).test(sources),
  );
  if (apply && missing.length > 0) writeJson(path, { ...app, ...Object.fromEntries(missing) });
  return missing.map(([key]) => `${path}: ${apply ? 'added' : 'would add'} ${key}`);
}

function main(): void {
  const [mode, ...roots] = process.argv.slice(2);
  if ((mode !== 'inventory' && mode !== 'rewrite') || roots.length === 0) {
    console.error('Usage: <inventory|rewrite> <roots…>');
    process.exit(1);
  }
  const apply = mode === 'rewrite';
  const texts = enTexts();
  const files: string[] = [];
  for (const root of roots) collect(root, files);
  const sources: string[] = [];
  let rewritten = 0;
  let judged = 0;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    sources.push(source);
    const changes: string[] = [];
    const next = rewriteSource(file, source, texts, changes);
    const open = next
      .split('\n')
      .flatMap((line, index) => REPLACED.filter(([pattern]) => pattern.test(line)).map(([, hint]) => `${index + 1}: ${hint}`));
    if (changes.length === 0 && open.length === 0) continue;
    console.info(file);
    for (const change of changes) console.info(`  ${apply ? 'rewrote' : 'would rewrite'} ${change}`);
    for (const line of open) console.info(`  judge ${line}`);
    if (changes.length > 0) rewritten += 1;
    judged += open.length;
    if (apply && changes.length > 0) writeFileSync(file, next);
  }
  const localeChanges = [...rewriteAppLocales(apply), ...restoreRemoved(sources.join('\n'), apply)];
  for (const change of localeChanges) console.info(`${apply ? 'rewrote' : 'would rewrite'} ${change}`);
  console.info(
    `\n${apply ? 'Rewrote' : 'Would rewrite'} ${rewritten} file(s) and ${localeChanges.length} locale entr(ies); ${judged} line(s) need judgment, across ${files.length} scanned.`,
  );
}

main();
