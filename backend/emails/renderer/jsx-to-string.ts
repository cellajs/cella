/**
 * Parts of this file are derived from [Hyperons](https://github.com/i-like-robots/hyperons).
 * @license MIT
 */
import type { FC, ReactNode } from 'react';
import { AttributeAliases, BooleanAttributes, EmptyObject, RAW_TAG, VoidElements } from './constants.js';
import { escapeAttribute, escapeText } from './escape-string.js';
import { isValidElement } from './is-valid-element.js';
import { stringifyStyles } from './stringify-styles.js';

const renderSuspense = async (children: ReactNode[]): ReturnType<typeof jsxToString> => {
  try {
    const result = await jsxToString(children);
    return result;
  } catch (error) {
    if (error instanceof Promise) {
      await error;
      return renderSuspense(children);
    }
    throw error;
  }
};

/**
 * Slightly modified version of Hyperons's
 * [`renderToString`](https://github.com/i-like-robots/hyperons/blob/main/src/render-to-string.js).
 */
export async function jsxToString(element: ReactNode): Promise<string> {
  if (element == null) {
    return '';
  }
  if (typeof element === 'string') {
    return escapeText(element);
  }
  if (typeof element === 'number') {
    return String(element);
  }
  if (typeof element === 'boolean' || element == null) {
    return '';
  }
  if (isIterable(element)) {
    let html = '';
    for (const child of element) {
      // eslint-disable-next-line no-await-in-loop
      html += await jsxToString(child);
    }
    return html;
  }

  if (element instanceof Promise) {
    const resolvedElement = await element;
    return jsxToString(resolvedElement);
  }

  if (!isValidElement(element)) {
    console.error('Unsupported JSX element:', element);
    throw new Error('Unsupported JSX element');
  }

  const { type } = element;
  const props = element.props || EmptyObject;

  if (typeof type === 'string') {
    // `Raw` content is written as it is, without a wrapper element.
    if (type === RAW_TAG) return (props as { dangerouslySetInnerHTML: { __html: string } }).dangerouslySetInnerHTML.__html;

    let html = `<${type}`;

    let innerHTML = '';

    for (const prop of Object.keys(props) as unknown as ReadonlyArray<keyof typeof props & string>) {
      const value = props[prop];

      if (prop === 'children' || prop === 'key' || prop === 'ref' || value == null) {
      } else if (prop === 'class' || prop === 'className') {
        // This condition is here because it is the most common attribute
        // and short-circuiting results in a ~5% performance boost.
        html += value ? ` class="${escapeAttribute(value as string)}"` : '';
      } else if (prop === 'style') {
        html += ` style="${escapeAttribute(stringifyStyles(value))}"`;
      } else if (prop === 'dangerouslySetInnerHTML') {
        // eslint-disable-next-line no-underscore-dangle
        innerHTML = (value as { __html: string }).__html;
      } else {
        // HTML attribute names are case-insensitive; written lowercase, as a parser reads them (`cellPadding`).
        const name = AttributeAliases[prop as keyof typeof AttributeAliases] || prop.toLowerCase();

        if (BooleanAttributes.has(name)) {
          html += value ? ` ${name}` : '';
        } else if (value === '') {
          html += ` ${name}`;
        } else if (typeof value === 'string') {
          html += ` ${name}="${escapeAttribute(value)}"`;
        } else if (typeof value === 'number') {
          html += ` ${name}="${String(value)}"`;
        } else if (typeof value === 'boolean') {
          html += ` ${name}="${value}"`;
        }
      }
    }

    if (VoidElements.has(type)) {
      html += '>';
    } else {
      html += '>';

      if (innerHTML) {
        html += innerHTML;
      } else if (type === 'style') {
        // CSS is raw text: written unescaped, only kept from closing its element early (`</style` in any case). Like text
        // children, `false`, `null` and `undefined` write nothing.
        html += [(props as { children?: unknown }).children]
          .flat(Number.POSITIVE_INFINITY)
          .filter((child) => typeof child === 'string' || typeof child === 'number')
          .join('')
          .replace(/<\/(style)/gi, '<\\/$1');
      } else {
        html += await jsxToString((props as { children?: ReactNode }).children);
      }

      html += `</${type}>`;
    }

    return html;
  }
  if (type) {
    if (typeof type === 'function') {
      const result = (type as FC)(props);
      const renderedFC = await (result instanceof Promise ? result.then(jsxToString) : jsxToString(result));
      const sym = (type as { $$typeof?: symbol }).$$typeof;

      if (sym && Symbol.keyFor(sym) === 'react.provider') {
        (type as any as { context: any[] }).context.pop();
      }

      return renderedFC;
    }
    if (typeof type === 'symbol') {
      const key = Symbol.keyFor(type);
      if (key === 'react.fragment') {
        return jsxToString((props as { children?: ReactNode }).children);
      }
      if (key === 'react.suspense') {
        const suspenseResult = await renderSuspense((props as { children: ReactNode[] }).children);
        return suspenseResult;
      }
    } else if (isReactForwardRef(type)) {
      return jsxToString(type.render(props, (props as { ref: unknown }).ref));
    } else if ((type as { $$typeof?: symbol }).$$typeof) {
      const key = Symbol.keyFor((type as { $$typeof: symbol }).$$typeof);
      if (key === 'react.provider') {
        (type as any as { context: any[] }).context.pop();
      } else if (key === 'react.context') {
        return jsxToString((props as { children?: ReactNode }).children);
      }
    }

    console.error('Unsupported JSX element:', type);
    throw new Error(`Unsupported JSX element type ${JSON.stringify(type)}`);
  }
  return '';
}

function isIterable(node: unknown): node is Iterable<unknown> {
  return typeof node === 'object' && node !== null && Symbol.iterator in node;
}

function isReactForwardRef(type: unknown): type is { $$typeof: symbol; render: (props: unknown, ref: unknown) => ReactNode } {
  return (
    typeof type === 'object' &&
    type !== null &&
    'render' in type &&
    '$$typeof' in type &&
    typeof type.$$typeof === 'symbol' &&
    Symbol.keyFor(type.$$typeof) === 'react.forward_ref'
  );
}
