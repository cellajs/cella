import ts from 'typescript';

/** A whitespace-separated token of a string and its offset in the source file. */
export type Token = { token: string; offset: number };

/**
 * The variants and the utility of a class token, without the important marker: `md:hover:x!` gives `['md', 'hover']`
 * and `x`. A `:` inside `[]` or `()` belongs to an arbitrary value or variant, as in `has-[a:hover]:x` or `text-[length:1em]`.
 */
export function splitToken(token: string): { variants: string[]; base: string } {
  const text = token.replace(/^!|!$/g, '');
  const variants: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '[' || char === '(') depth++;
    else if (char === ']' || char === ')') depth--;
    else if (char === ':' && depth === 0) {
      variants.push(text.slice(start, index));
      start = index + 1;
    }
  }
  return { variants, base: text.slice(start).replace(/^!/, '') };
}

/** Whitespace-separated tokens of every string and template piece in `node` and under it, with their source offsets. */
export function stringTokens(sourceFile: ts.SourceFile, node: ts.Node): Token[] {
  const found: Token[] = [];
  (function visit(child: ts.Node) {
    if (ts.isStringLiteralLike(child) || ts.isTemplateHead(child) || ts.isTemplateMiddle(child) || ts.isTemplateTail(child)) {
      const start = child.getStart(sourceFile) + 1;
      for (const match of child.text.matchAll(/\S+/g)) found.push({ token: match[0], offset: start + match.index });
    }
    child.forEachChild(visit);
  })(node);
  return found;
}
