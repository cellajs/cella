import ts from 'typescript';
import { splitToken, stringTokens, type Token } from './class-tokens.ts';
import { type Finding, isFrontendSource, lineColumn } from './repo-files.ts';
import { parseSource } from './source-comments.ts';

/** Paths that keep palette grays, each with its reason. */
const paletteExceptions: Record<string, string> = {
  'frontend/src/modules/docs/': 'syntax, HTTP method and status colors, which carry meaning the theme steps do not',
  'frontend/src/modules/common/json-viewer/theme.ts': 'syntax colors of the JSON viewer',
};

const tokenModifier = /^text-[a-z-]*foreground(?:-soft)?\/[\w.[\]]+$/;
const paletteGray = /^text-(?:gray|slate|zinc|neutral|stone)-\d+(?:\/[\w.[\]]+)?$/;
const restOpacity = /^opacity-(?:50|60|70|75|80)$/;
/** Variants under which a class still applies at rest: breakpoints, the color scheme and the contrast setting. */
const restVariant = /^(?:sm|md|lg|xl|2xl|max-[\w-]+|min-[\w-]+|dark|more-contrast|standalone)$/;
const textHint = /^(?:text-(?:2xs|xs|sm|md|base|lg|\d?xl|\[[^\]]+\])|font-(?:light|normal|medium|semibold|bold))$/;
/** Elements that draw a picture, where opacity is not text dimming. */
const pictureTag = /(?:Icon|Avatar|Spinner)$|^(?:svg|img)$/;

function isRestOpacity(token: string): boolean {
  const { variants, base } = splitToken(token);
  return restOpacity.test(base) && variants.every((variant) => restVariant.test(variant));
}

/** Whether visible text sits in this element: a text child or a value such as `{title}`, outside `sr-only` spans and `{icon}`. */
function holdsText(sourceFile: ts.SourceFile, node: ts.JsxElement | ts.JsxFragment): boolean {
  const expressionHoldsText = (expression: ts.Expression): boolean => {
    if (ts.isParenthesizedExpression(expression)) return expressionHoldsText(expression.expression);
    if (ts.isJsxElement(expression) || ts.isJsxFragment(expression)) return holdsText(sourceFile, expression);
    if (ts.isJsxSelfClosingElement(expression)) return false;
    if (ts.isConditionalExpression(expression)) return expressionHoldsText(expression.whenTrue) || expressionHoldsText(expression.whenFalse);
    if (ts.isBinaryExpression(expression)) return expressionHoldsText(expression.right);
    return !(ts.isIdentifier(expression) && /icon$/i.test(expression.text));
  };
  return node.children.some((child) => {
    if (ts.isJsxText(child)) return child.text.trim() !== '';
    if (ts.isJsxExpression(child)) return !!child.expression && expressionHoldsText(child.expression);
    if (ts.isJsxElement(child) && /\bsr-only\b/.test(child.openingElement.attributes.getText(sourceFile))) return false;
    return (ts.isJsxElement(child) || ts.isJsxFragment(child)) && holdsText(sourceFile, child);
  });
}

/** Text color findings in one frontend file; opacity on text at rest is a review marker. */
export function textColorFindings(file: string, source: string): Finding[] {
  if (!isFrontendSource(file) || !/opacity-|text-/.test(source)) return [];
  const sourceFile = parseSource(file, source);
  const findings = new Map<number, Finding>();
  const report = (offset: number, term: string, message: string, review = false) => {
    findings.set(offset, { file, ...lineColumn(source, offset), rule: 'text-color', term, message, ...(review && { review }) });
  };
  const paletteAllowed = Object.keys(paletteExceptions).some((path) => file.startsWith(path));

  for (const { token, offset } of stringTokens(sourceFile, sourceFile)) {
    const { variants, base } = splitToken(token);
    if (tokenModifier.test(base) && !variants.some((variant) => variant.includes('disabled'))) {
      report(
        offset,
        token,
        'a text token takes no opacity modifier; pick the step: text-foreground-soft, text-muted-foreground or text-faint-foreground',
      );
    } else if (paletteGray.test(base) && !paletteAllowed) {
      report(offset, token, 'a palette gray skips the theme and the contrast setting; use a text step such as text-muted-foreground');
    }
  }

  const reviewOpacity = (tokens: Token[], text: boolean) => {
    const dimmed = tokens.find(({ token }) => isRestOpacity(token));
    if (!dimmed || !(text || tokens.some(({ token }) => textHint.test(splitToken(token).base)))) return;
    report(dimmed.offset, dimmed.token, 'opacity dims this text at rest, below its token; color it with a text step', true);
  };
  const isClassName = (node: ts.Node): node is ts.JsxAttribute => ts.isJsxAttribute(node) && node.name.getText(sourceFile) === 'className';
  // An element's class is judged with its content; any other string, such as a tw() constant, by its own text hints
  sourceFile.forEachChild(function visit(node) {
    if (isClassName(node)) return;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const className = opening.attributes.properties.find(isClassName);
      if (className && !pictureTag.test(opening.tagName.getText(sourceFile))) {
        reviewOpacity(stringTokens(sourceFile, className), ts.isJsxElement(node) && holdsText(sourceFile, node));
      }
    } else if (ts.isStringLiteralLike(node)) reviewOpacity(stringTokens(sourceFile, node), false);
    node.forEachChild(visit);
  });
  return [...findings.values()];
}
