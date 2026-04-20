import { MoonChunkError } from '../errors';
import { RuntimeHelpers } from '../types';
import { Scope } from './scope';
import { evalExpr } from './expression';
import { resolvePathValue } from './path';
import { stringifyValue } from './values';

const NO_HELPERS: RuntimeHelpers = { getGlobal: () => undefined };
const IDENTIFIER_PATH_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function evalTemplateExpr(
  expr: string,
  scope: Scope,
  cwd: string,
  helpers: RuntimeHelpers
): unknown {
  const trimmed = expr.trim();

  if (IDENTIFIER_PATH_PATTERN.test(trimmed)) {
    const segments = trimmed.split('.');
    const rootName = segments[0];
    let root: unknown = scope.get(rootName);
    if (root === undefined) root = helpers.getGlobal(rootName, 1);
    if (root === undefined) {
      throw new MoonChunkError(`Unknown variable: ${rootName}`, 1, 1);
    }
    if (segments.length === 1) return root;
    return resolvePathValue(root, segments.slice(1));
  }

  return evalExpr(trimmed, scope, cwd, 1, helpers);
}

function findBalancedBraceSegment(input: string, openPos: number): { expr: string; end: number } {
  let depth = 0;
  let i = openPos;
  let inString = false;
  let escaped = false;

  while (i < input.length) {
    const ch = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      i += 1;
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return { expr: input.slice(openPos + 1, i), end: i + 1 };
      }
    }
    i += 1;
  }

  throw new MoonChunkError('Unclosed dynamic expression block in content template.', 1, 1);
}

export function renderContentTemplate(
  template: string,
  scope: Scope,
  cwd: string,
  helpers: RuntimeHelpers = NO_HELPERS
): string {
  let out = '';
  let i = 0;

  while (i < template.length) {
    const ch = template[i];
    if (ch !== '{') {
      out += ch;
      i += 1;
      continue;
    }

    const segment = findBalancedBraceSegment(template, i);
    const expr = segment.expr.trim();
    if (!expr) {
      out += '{}';
      i = segment.end;
      continue;
    }

    const value = evalTemplateExpr(expr, scope, cwd, helpers);
    out += stringifyValue(value);
    i = segment.end;
  }

  return out;
}

export function renderStringWithInterpolations(
  value: string,
  scope: Scope,
  cwd: string,
  helpers: RuntimeHelpers = NO_HELPERS
): string {
  return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_all, expr) => {
    const resolved = evalTemplateExpr(expr, scope, cwd, helpers);
    return stringifyValue(resolved);
  });
}

export function renderLayoutTemplate(
  template: string,
  scope: Scope,
  cwd: string,
  helpers: RuntimeHelpers = NO_HELPERS
): string {
  return renderStringWithInterpolations(template, scope, cwd, helpers);
}
