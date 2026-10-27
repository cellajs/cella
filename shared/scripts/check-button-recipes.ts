/**
 * A button takes its color from its variant; a neutral hover is `hover:bg-muted` on a pressable, accent on a navigable
 * item, sidebar-accent in the sidebar. Under `--audit`, a button class that sets a fill, edge or text color and a neutral
 * hover off that model are review markers, a destructive or muted text a button keeps on purpose included.
 */
import ts from 'typescript';
import { splitToken, stringTokens, type Token } from './class-tokens.ts';
import { type Finding, isFrontendSource, lineColumn } from './repo-files.ts';
import { parseSource } from './source-comments.ts';

/** Color utilities by kind; a size, width, alignment or layout keyword under the same prefix is none of them. */
const colorUtilities = {
  fill: /^bg-(?!(?:clip|origin|blend|size|position|repeat|linear|radial|conic)-|(?:none|cover|contain|auto|fixed|local|scroll|no-repeat|repeat|center|top|bottom|left|right)$)/,
  edge: /^border-(?:[trblxyse]-)?(?![trblxyse](?:-|$)|\d|px$|\[\d|spacing|(?:solid|dashed|dotted|double|hidden|none|collapse|separate)$)/,
  text: /^text-(?!\[\d|\[length:|(?:2xs|xs|sm|base|md|lg|\d?xl|left|center|right|start|end|justify|wrap|nowrap|balance|pretty|ellipsis|clip)$)/,
};
/** Variants that style a child or a pseudo-element, not the button. */
const childVariant = /^(?:\[&|\*|before$|after$|placeholder$|selection$|marker$|file$)/;
const neutralHover = /^bg-(?:accent|foreground|muted)\/[\w.[\]]+$/;

/** State fills of the model itself: the current item takes accent, an open trigger muted, a sidebar item sidebar-accent. */
const modelStateFill = /^bg-(?:accent|muted|sidebar-accent)$/;

/** Whether a class sets a color the variant owns. */
export function restylesVariant(token: string): boolean {
  const { variants, base } = splitToken(token);
  if (variants.some((variant) => childVariant.test(variant))) return false;
  if (modelStateFill.test(base) && variants.length > 0 && !variants.includes('hover')) return false;
  return Object.values(colorUtilities).some((utility) => utility.test(base));
}

/** Whether a class is a neutral hover off the model; `bg-muted/50`, shadcn's table row and ghost's dark hover, is on it. */
export function offModelHover(token: string): boolean {
  const { variants, base } = splitToken(token);
  return neutralHover.test(base) && base !== 'bg-muted/50' && variants.some((variant) => /(?:^|-)hover(?:\/|$)/.test(variant));
}

const isButton = (node: ts.Node) => (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) && tagName(node) === 'Button';
const tagName = (node: ts.JsxSelfClosingElement | ts.JsxElement) => (ts.isJsxElement(node) ? node.openingElement : node).tagName.getText();

/** Button and hover recipe markers in one frontend file. */
export function buttonRecipeFindings(file: string, source: string): Finding[] {
  if (!isFrontendSource(file) || file.endsWith('/ui/button.tsx') || !/hover|Button|buttonVariants/.test(source)) return [];
  const sourceFile = parseSource(file, source);
  const findings = new Map<number, Finding>();
  const report = (offset: number, term: string, message: string) => {
    findings.set(offset, { file, ...lineColumn(source, offset), rule: 'button-recipe', term, message, review: true });
  };
  const judgeButton = (tokens: Token[]) => {
    const restyled = tokens.filter(({ token }) => restylesVariant(token));
    if (restyled.length === 0) return;
    const list = restyled.map(({ token }) => token).join(' ');
    report(restyled[0].offset, restyled[0].token, `restyles its variant (${list}); a button className sets layout only, the variant owns color`);
  };

  for (const { token, offset } of stringTokens(sourceFile, sourceFile)) {
    if (offModelHover(token)) {
      report(offset, token, 'a neutral hover takes hover:bg-muted on a pressable, accent on a navigable item, sidebar-accent in the sidebar');
    }
  }

  sourceFile.forEachChild(function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const { attributes } = ts.isJsxElement(node) ? node.openingElement : node;
      const attribute = (name: string) => attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.getText() === name);
      const render = attribute('render');
      const rendersButton =
        render && ts.isJsxAttribute(render) && render.initializer && ts.isJsxExpression(render.initializer) && render.initializer.expression;
      const className = attribute('className');
      if (className && (isButton(node) || (rendersButton && isButton(rendersButton)))) judgeButton(stringTokens(sourceFile, className));
    } else if (ts.isCallExpression(node) && node.expression.getText() === 'buttonVariants') {
      const [options] = node.arguments;
      const className =
        options && ts.isObjectLiteralExpression(options)
          ? options.properties.find((property) => property.name?.getText() === 'className')
          : undefined;
      // A buttonVariants() call inside cn() takes its call site's classes as cn()'s other arguments
      const siblings = ts.isCallExpression(node.parent) ? node.parent.arguments.filter((argument) => argument !== node) : [];
      judgeButton([className, ...siblings].flatMap((part) => (part ? stringTokens(sourceFile, part) : [])));
    }
    node.forEachChild(visit);
  });
  return [...findings.values()];
}
