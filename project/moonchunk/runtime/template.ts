import { MoonChunkError } from '../errors';
import { RuntimeHelpers } from '../types';
import { Scope } from './scope';
import { evalExpr } from './expression';
import { stringifyValue } from './values';

const NO_HELPERS: RuntimeHelpers = { getGlobal: () => undefined };

type TemplateNode =
  | { type: 'Text'; value: string }
  | { type: 'Expr'; expr: string }
  | { type: 'If'; condition: string; body: TemplateNode[] }
  | { type: 'For'; item: string; sourceExpr: string; body: TemplateNode[] };

export function renderTemplate(
  template: string,
  scope: Scope,
  cwd: string,
  helpers: RuntimeHelpers = NO_HELPERS
): string {
  function parseNodes(pos: number, endTag: string | null): { nodes: TemplateNode[]; pos: number } {
    const nodes: TemplateNode[] = [];

    while (pos < template.length) {
      const varPos = template.indexOf('{{', pos);
      const tagPos = template.indexOf('{%', pos);

      let nextPos = -1;
      let isVar = false;

      if (varPos === -1 && tagPos === -1) {
        nodes.push({ type: 'Text', value: template.slice(pos) });
        return { nodes, pos: template.length };
      }

      if (varPos !== -1 && (tagPos === -1 || varPos < tagPos)) {
        nextPos = varPos;
        isVar = true;
      } else {
        nextPos = tagPos;
      }

      if (nextPos > pos) {
        nodes.push({ type: 'Text', value: template.slice(pos, nextPos) });
      }

      if (isVar) {
        const close = template.indexOf('}}', nextPos + 2);
        if (close === -1) throw new MoonChunkError('Unclosed {{ ... }} in template.', 1, 1);
        nodes.push({ type: 'Expr', expr: template.slice(nextPos + 2, close).trim() });
        pos = close + 2;
        continue;
      }

      const close = template.indexOf('%}', nextPos + 2);
      if (close === -1) throw new MoonChunkError('Unclosed {% ... %} in template.', 1, 1);

      const tag = template.slice(nextPos + 2, close).trim();
      pos = close + 2;

      if (endTag && tag === endTag) {
        return { nodes, pos };
      }

      if (tag.startsWith('if ')) {
        const inner = parseNodes(pos, 'endif');
        nodes.push({ type: 'If', condition: tag.slice(3).trim(), body: inner.nodes });
        pos = inner.pos;
        continue;
      }

      if (tag.startsWith('for ')) {
        const m = tag.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+)$/);
        if (!m) throw new MoonChunkError(`Invalid template for tag: ${tag}`, 1, 1);
        const inner = parseNodes(pos, 'endfor');
        nodes.push({ type: 'For', item: m[1], sourceExpr: m[2], body: inner.nodes });
        pos = inner.pos;
        continue;
      }

      if (tag === 'endif' || tag === 'endfor') throw new MoonChunkError(`Unexpected template tag: ${tag}`, 1, 1);
      throw new MoonChunkError(`Unsupported template tag: ${tag}`, 1, 1);
    }

    if (endTag) throw new MoonChunkError(`Missing template closing tag: ${endTag}`, 1, 1);
    return { nodes, pos };
  }

  function renderNodes(nodes: TemplateNode[], localScope: Scope): string {
    let out = '';
    for (const node of nodes) {
      if (node.type === 'Text') out += node.value;
      if (node.type === 'Expr') {
        const value = evalExpr(node.expr, localScope, cwd, 1, helpers);
        out += stringifyValue(value);
      }
      if (node.type === 'If') {
        const cond = evalExpr(node.condition, localScope, cwd, 1, helpers);
        if (Boolean(cond)) out += renderNodes(node.body, localScope);
      }
      if (node.type === 'For') {
        const source = evalExpr(node.sourceExpr, localScope, cwd, 1, helpers);
        if (!Array.isArray(source)) throw new MoonChunkError('Template for-loop requires array value.', 1, 1);
        for (const item of source) {
          const child = localScope.derive();
          child.set(node.item, item);
          out += renderNodes(node.body, child);
        }
      }
    }
    return out;
  }

  const parsed = parseNodes(0, null);
  return renderNodes(parsed.nodes, scope);
}

export function renderStringWithInterpolations(
  value: string,
  scope: Scope,
  cwd: string,
  helpers: RuntimeHelpers = NO_HELPERS
): string {
  return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_all, expr) => {
    const resolved = evalExpr(expr, scope, cwd, 1, helpers);
    return stringifyValue(resolved);
  });
}
