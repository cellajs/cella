import sanitizeHtml, { type IOptions } from 'sanitize-html';

/** Short translated strings: inline emphasis, line break and safe links only. */
const inlinePolicy: IOptions = {
  allowedTags: ['strong', 'em', 'b', 'i', 'u', 'br', 'span', 'a'],
  allowedAttributes: {
    a: ['href', 'rel', 'target'],
    span: ['style'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
};

/** Long-form rich text: wider tag set, URL schemes still restricted to safe values. */
const richTextPolicy: IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'em',
    'b',
    'i',
    'u',
    's',
    'a',
    'ul',
    'ol',
    'li',
    'blockquote',
    'code',
    'pre',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'span',
    'div',
    'img',
    'hr',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  allowedAttributes: {
    a: ['href', 'rel', 'target'],
    img: ['src', 'alt', 'width', 'height'],
    span: ['style', 'class'],
    div: ['style', 'class'],
    p: ['style', 'class'],
    table: ['class'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'data'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
};

const policies = { inline: inlinePolicy, richText: richTextPolicy } as const;

export type SafeHtmlPolicy = keyof typeof policies;

interface SafeHtmlProps {
  /** Untrusted HTML string to sanitize and render. */
  html: string;
  /** Sanitization policy. `inline` for translated snippets, `richText` for newsletter content. */
  policy: SafeHtmlPolicy;
  /** Wrapper element. Default `span`. */
  as?: 'span' | 'div';
  /** Optional className forwarded to the wrapper. */
  className?: string;
}

/** The only `dangerouslySetInnerHTML` in the email pipeline; input is sanitized by policy. */
export const SafeHtml = ({ html, policy, as: Tag = 'span', className }: SafeHtmlProps) => {
  const clean = sanitizeHtml(html, policies[policy]);
  // biome-ignore lint/security/noDangerouslySetInnerHtml: input is sanitized via sanitize-html allowlist policy
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
};

export const Template = SafeHtml;
