import { htmlToText } from 'html-to-text';
import { rehype } from 'rehype';
import stringify from 'rehype-stringify';
import { getConditionalPlugin } from './conditional.js';
import { jsxToString } from './jsx-to-string.js';
import { getMovePlugin } from './move-style.js';
import { getRawPlugin, unescapeForRawComponent } from './raw.js';
import type { PlainTextOptions, RenderOptions } from './types.js';

export const jsxEmailTags = ['jsx-email-cond'];

export const renderPlainText = async (component: React.ReactElement, options?: PlainTextOptions) => {
  const { formatters, selectors } = options || {};

  const result = await jsxToString(component);
  return htmlToText(result, {
    formatters: {
      raw: (elem, _walk, builder) => {
        if (elem.children.length && elem.children[0].type === 'comment') {
          builder.addInline(unescapeForRawComponent(elem.children[0].data!.trim()));
        }
      },
      ...formatters,
    },

    selectors: [
      { format: 'skip', selector: 'img' },
      { format: 'skip', selector: '[data-skip="true"]' },
      { options: { linkBrackets: false }, selector: 'a' },
      {
        format: 'raw',
        options: {},
        selector: 'jsx-email-raw',
      },
      ...(selectors || []),
    ],
    ...options,
  });
};

export const render = async (component: React.ReactElement, options?: RenderOptions) => {
  if (options?.plainText)
    return renderPlainText(component, typeof options.plainText === 'object' ? options.plainText : {});

  const html = await jsxToString(component);
  return processHtml(html);
};

const processHtml = async (html: string) => {
  const docType =
    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';
  const movePlugin = await getMovePlugin();
  const rawPlugin = await getRawPlugin();
  const conditionalPlugin = await getConditionalPlugin();
  const settings = { emitParseErrors: true };
  // Remove any stray jsx-email markers (with or without attributes)
  const reJsxTags = new RegExp(`<[/]?(${jsxEmailTags.join('|')})(?:\\s[^>]*)?>`, 'g');

  const processor = rehype().data('settings', settings);

  processor.use(movePlugin);
  processor.use(rawPlugin);
  // Ensure conditional processing happens after raw hoisting
  processor.use(conditionalPlugin);

  const doc = await processor
    .use(stringify, {
      allowDangerousCharacters: true,
      allowDangerousHtml: true,
      characterReferences: {
        useNamedReferences: true,
      },
      closeEmptyElements: true,
      collapseEmptyAttributes: true,
    })
    .process(html);

  let result = docType + String(doc).replace('<!doctype html>', '').replace('<head></head>', '');

  result = result.replace(reJsxTags, '');

  return result;
};
