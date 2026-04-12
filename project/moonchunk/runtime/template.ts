import { MoonChunkError } from '../errors';
import { RuntimeHelpers } from '../types';
import { Scope } from './scope';
import { evalExpr } from './expression';
import { stringifyValue } from './values';

const NO_HELPERS: RuntimeHelpers = { getGlobal: () => undefined };

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

    const value = evalExpr(expr, scope, cwd, 1, helpers);
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
    const resolved = evalExpr(expr, scope, cwd, 1, helpers);
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
