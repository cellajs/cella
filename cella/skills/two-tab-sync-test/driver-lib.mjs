// Shared by the drivers in this folder: the attachments table and description editor helpers.

// Exact name: bench rows are numbered, so "… 2" is also the start of "… 20" and "… 201".
export const exactText = (text) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
export const rowByName = (page, name) =>
  page.locator('.rdg-row').filter({ has: page.locator('span.truncate.font-medium', { hasText: exactText(name) }) });

// Remote cursor labels sit inside the editor's text, so they are cut before matching.
export const editorText = (editor) =>
  editor.evaluate((el) => {
    const copy = el.cloneNode(true);
    for (const cursor of copy.querySelectorAll('.bn-collaboration-cursor__base')) cursor.remove();
    return copy.textContent ?? '';
  });

/** Puts the caret at the document end. The editor reads a moved caret a moment later; text typed at once goes to the old one. */
export async function caretToEnd(page, editor) {
  await editor.evaluate((el) => {
    el.focus();
    const selection = getSelection();
    selection.selectAllChildren(el);
    selection.collapseToEnd();
  });
  await page.waitForTimeout(150);
}
