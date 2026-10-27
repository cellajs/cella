import { type ChildNode, isTag, isText } from 'domhandler';
import { parseDocument } from 'htmlparser2';

/** Elements whose content is never visible text. */
const skipped = new Set(['head', 'style', 'script', 'title']);

/** Elements that end a line. */
const blocks = new Set(['p', 'div', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'table', 'ul', 'ol', 'blockquote', 'pre']);

/** Hidden by an inline style: the inbox preview line, and the logo only the dark styles show. */
const isHidden = (style = '') => /display\s*:\s*none/i.test(style);

/** The visible text of parsed nodes; comments, and with them Outlook's conditional markup, are no text. */
const textOf = (nodes: ChildNode[]): string =>
  nodes
    .map((node) => {
      if (isText(node)) return node.data;
      if (!isTag(node) || skipped.has(node.name) || isHidden(node.attribs.style)) return '';

      const inner = textOf(node.children);
      switch (node.name) {
        case 'br':
          return '\n';
        case 'a': {
          const label = inner.trim();
          const target = (node.attribs.href ?? '').replace(/^mailto:/, '');
          if (!label) return '';
          return !target || label === target ? label : `${label} (${target})`;
        }
        case 'li':
          return `- ${inner}\n`;
        case 'td':
          return `${inner} `;
        default:
          return blocks.has(node.name) ? `${inner}\n` : inner;
      }
    })
    .join('');

/**
 * The plain-text part of a rendered mail: its visible text, a link as "label (url)", a table row and a block on lines
 * of their own. Parsed, never matched by pattern, so no markup survives into the text.
 */
export const htmlToText = (html: string) =>
  textOf(parseDocument(html, { decodeEntities: true }).children)
    .replace(/[͏​-‏﻿]/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
