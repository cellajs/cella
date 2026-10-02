/**
 * How a criterion gets its evidence: `axe` rules tagged with it, a named browser `probe`, a `code` check over the
 * repository, or a `manual` pass by a person. The audit decides a row only when none of its checks is `manual`.
 */
type Check = 'axe' | `probe:${string}` | `code:${string}` | 'manual';

export interface Criterion {
  id: string;
  name: string;
  level: 'A' | 'AA';
  /** EN 301 549 V3.2.1 web clause; null for criteria new in WCAG 2.2, which that version predates. */
  en301549: string | null;
  checks: Check[];
}

const c = (id: string, name: string, level: 'A' | 'AA', checks: Check[], newIn22 = false): Criterion => ({
  id,
  name,
  level,
  en301549: newIn22 ? null : `9.${id}`,
  checks,
});

/** WCAG 2.2 Level A and AA success criteria (4.1.1 Parsing is obsolete and left out). */
export const criteria: Criterion[] = [
  c('1.1.1', 'Non-text Content', 'A', ['axe', 'manual']),
  c('1.2.1', 'Audio-only and Video-only (Prerecorded)', 'A', ['code:media']),
  c('1.2.2', 'Captions (Prerecorded)', 'A', ['code:media']),
  c('1.2.3', 'Audio Description or Media Alternative (Prerecorded)', 'A', ['code:media']),
  c('1.2.4', 'Captions (Live)', 'AA', ['code:media']),
  c('1.2.5', 'Audio Description (Prerecorded)', 'AA', ['code:media']),
  c('1.3.1', 'Info and Relationships', 'A', ['axe', 'manual']),
  c('1.3.2', 'Meaningful Sequence', 'A', ['manual']),
  c('1.3.3', 'Sensory Characteristics', 'A', ['manual']),
  c('1.3.4', 'Orientation', 'AA', ['probe:orientation']),
  c('1.3.5', 'Identify Input Purpose', 'AA', ['axe', 'probe:autocomplete']),
  c('1.4.1', 'Use of Color', 'A', ['axe', 'manual']),
  c('1.4.2', 'Audio Control', 'A', ['code:autoplay']),
  c('1.4.3', 'Contrast (Minimum)', 'AA', ['axe']),
  c('1.4.4', 'Resize Text', 'AA', ['probe:resize']),
  c('1.4.5', 'Images of Text', 'AA', ['manual']),
  c('1.4.10', 'Reflow', 'AA', ['probe:reflow']),
  c('1.4.11', 'Non-text Contrast', 'AA', ['manual']),
  c('1.4.12', 'Text Spacing', 'AA', ['probe:text-spacing']),
  c('1.4.13', 'Content on Hover or Focus', 'AA', ['probe:hover-content', 'manual']),
  c('2.1.1', 'Keyboard', 'A', ['axe', 'probe:keyboard', 'manual']),
  c('2.1.2', 'No Keyboard Trap', 'A', ['probe:keyboard']),
  c('2.1.4', 'Character Key Shortcuts', 'A', ['code:shortcuts']),
  c('2.2.1', 'Timing Adjustable', 'A', ['code:timing']),
  c('2.2.2', 'Pause, Stop, Hide', 'A', ['code:motion', 'manual']),
  c('2.3.1', 'Three Flashes or Below Threshold', 'A', ['code:motion']),
  c('2.4.1', 'Bypass Blocks', 'A', ['axe', 'probe:landmarks']),
  c('2.4.2', 'Page Titled', 'A', ['axe', 'probe:titles']),
  c('2.4.3', 'Focus Order', 'A', ['probe:keyboard', 'manual']),
  c('2.4.4', 'Link Purpose (In Context)', 'A', ['axe', 'manual']),
  c('2.4.5', 'Multiple Ways', 'AA', ['manual']),
  c('2.4.6', 'Headings and Labels', 'AA', ['manual']),
  c('2.4.7', 'Focus Visible', 'AA', ['probe:keyboard']),
  c('2.4.11', 'Focus Not Obscured (Minimum)', 'AA', ['probe:keyboard'], true),
  c('2.5.1', 'Pointer Gestures', 'A', ['code:gestures']),
  c('2.5.2', 'Pointer Cancellation', 'A', ['manual']),
  c('2.5.3', 'Label in Name', 'A', ['axe', 'manual']),
  c('2.5.4', 'Motion Actuation', 'A', ['code:motion-actuation']),
  c('2.5.7', 'Dragging Movements', 'AA', ['code:dragging', 'manual'], true),
  c('2.5.8', 'Target Size (Minimum)', 'AA', ['axe'], true),
  c('3.1.1', 'Language of Page', 'A', ['axe', 'probe:language']),
  c('3.1.2', 'Language of Parts', 'AA', ['manual']),
  c('3.2.1', 'On Focus', 'A', ['probe:keyboard']),
  c('3.2.2', 'On Input', 'A', ['manual']),
  c('3.2.3', 'Consistent Navigation', 'AA', ['manual']),
  c('3.2.4', 'Consistent Identification', 'AA', ['manual']),
  c('3.2.6', 'Consistent Help', 'A', ['manual'], true),
  c('3.3.1', 'Error Identification', 'A', ['probe:form-errors']),
  c('3.3.2', 'Labels or Instructions', 'A', ['axe', 'manual']),
  c('3.3.3', 'Error Suggestion', 'AA', ['manual']),
  c('3.3.4', 'Error Prevention (Legal, Financial, Data)', 'AA', ['manual']),
  c('3.3.7', 'Redundant Entry', 'A', ['manual'], true),
  c('3.3.8', 'Accessible Authentication (Minimum)', 'AA', ['code:authentication', 'probe:autocomplete'], true),
  c('4.1.2', 'Name, Role, Value', 'A', ['axe', 'manual']),
  c('4.1.3', 'Status Messages', 'AA', ['probe:status-messages', 'manual']),
];

/** What the person doing the manual pass checks, for each criterion a tool cannot decide alone. */
export const manualSteps: Record<string, string> = {
  '1.1.1':
    'Every meaningful image, icon button and chart has a text alternative with the same purpose; decorative images are hidden from screen readers.',
  '1.2.1': 'Decide whether the app publishes media of its own, or only plays files users upload.',
  '1.3.1': 'With a screen reader, headings, lists, tables, form labels and groups are announced as what they look like.',
  '1.3.2': 'Reading each page top to bottom with a screen reader gives a sensible order that matches the visual one.',
  '1.3.3': 'No instruction relies only on shape, color, size, position or sound ("press the round button on the right").',
  '1.4.1': 'Color is never the only signal: links in text, required fields, errors, status badges and charts also differ in text or shape.',
  '1.4.2': 'Nothing plays sound by itself.',
  '1.4.3': 'Where axe could not compute contrast (text over images, gradients, overlays), measure it: 4.5:1, or 3:1 for large text, in both modes.',
  '1.4.5': 'No text is shown as an image, except logos.',
  '1.4.11': 'Input borders, button outlines, focus indicators, icons and chart parts reach 3:1 against their background in both modes.',
  '1.4.13': 'Tooltips, menus and popovers that appear on hover or focus can be dismissed with Escape, hovered, and stay until dismissed.',
  '2.1.1': 'Every function works with the keyboard alone: menus, dialogs, the data grid, the editor, uploads, drag and drop, date pickers.',
  '2.2.1': 'No time limit makes a user lose work or information they need; toasts that close by themselves repeat nothing essential.',
  '2.2.2': 'Animations that start by themselves and run longer than 5 seconds beside other content can be paused, or stop with reduced motion.',
  '2.4.3': 'The Tab order follows the visual and logical order; focus moves into a dialog when it opens and back to its trigger when it closes.',
  '2.4.4': 'Each link says where it goes, from its text or its sentence, list item or table cell.',
  '2.4.5': 'Each page can be reached in at least two ways: navigation, search, links.',
  '2.4.6': 'Headings and labels describe their topic or purpose.',
  '2.5.1': 'Every gesture (swipe, pinch) has a single-pointer alternative such as a button.',
  '2.5.2': 'Actions fire when the pointer is released and can be cancelled by moving away before release.',
  '2.5.3': 'The visible label of each control is part of its accessible name, so voice control can use it.',
  '2.5.7': 'Every drag action has a single-pointer alternative, such as a menu item or move buttons.',
  '2.5.8': 'Where axe could not decide, targets are at least 24 by 24 pixels or have enough space around them.',
  '3.1.2': 'Passages in another language than the page are marked with their language.',
  '3.2.2': 'Changing a field (select, checkbox, input) never navigates or submits without warning.',
  '3.2.3': 'Navigation repeated across pages appears in the same order.',
  '3.2.4': 'Components with the same function have the same label and icon everywhere.',
  '3.2.6': 'Help (contact, docs, chat) appears in the same relative place on every page that offers it.',
  '3.3.2': 'Every input has a visible label or instruction, including required markers and expected formats.',
  '3.3.3': 'Error messages say how to fix the input when that is known.',
  '3.3.4': 'Irreversible actions (delete, leave, remove members) can be confirmed, undone or reviewed first.',
  '3.3.7': 'Multi-step flows never ask again for information given earlier in the same process.',
  '4.1.2': 'With a screen reader, custom controls (menus, tabs, toggles, the grid, the editor) announce their name, role, state and value.',
  '4.1.3': 'With a screen reader, status messages (toasts, result counts, saving states) are announced without moving focus.',
};

/** Maps an axe tag such as `wcag1410` to its criterion id (`1.4.10`), or null for non-criterion tags. */
export function criterionFromAxeTag(tag: string) {
  const match = /^wcag(\d)(\d)(\d{1,2})$/.exec(tag);
  if (!match) return null;
  const id = `${match[1]}.${match[2]}.${match[3]}`;
  return criteria.some((criterion) => criterion.id === id) ? id : null;
}
