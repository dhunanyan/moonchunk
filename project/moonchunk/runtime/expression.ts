import * as fs from 'node:fs';
import * as path from 'node:path';
import { MoonChunkError } from '../errors';
import { RuntimeHelpers } from '../types';
import { Scope } from './scope';
import {
  coerceToNumeric,
  inferType,
  isNumericValue,
  makeNumeric,
  normalizeJsonNumbers,
  promoteNumericType,
  stringifyValue
} from './values';
import { resolvePathValue } from './path';

type TokenType =
  | 'number'
  | 'string'
  | 'identifier'
  | 'true'
  | 'false'
  | 'and'
  | 'or'
  | 'not'
  | '+'
  | '-'
  | '*'
  | '/'
  | '('
  | ')'
  | ','
  | '.'
  | '=='
  | '!='
  | '<'
  | '>'
  | '<='
  | '>='
  | 'eof';

type ExprToken = { type: TokenType; text: string };

const NO_HELPERS: RuntimeHelpers = { getGlobal: () => undefined };

export function evalExpr(
  rawExpr: string,
  scope: Scope,
  cwd: string,
  line = 1,
  helpers: RuntimeHelpers = NO_HELPERS
): unknown {
  const expr = rawExpr.trim();
  if (!expr) return null;

  const tokens: ExprToken[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }

    const two = expr.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '<=' || two === '>=') {
      tokens.push({ type: two as TokenType, text: two });
      i += 2;
      continue;
    }

    if ('+-*/(),.<>'.includes(ch)) {
      tokens.push({ type: ch as TokenType, text: ch });
      i += 1;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      let str = '';
      while (j < expr.length) {
        const c = expr[j];
        if (c === '\\' && j + 1 < expr.length) {
          str += expr[j + 1];
          j += 2;
          continue;
        }
        if (c === '"') break;
        str += c;
        j += 1;
      }
      if (j >= expr.length || expr[j] !== '"') {
        throw new MoonChunkError('Unterminated string literal in expression.', line, 1);
      }
      tokens.push({ type: 'string', text: str });
      i = j + 1;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9]/.test(expr[j])) j += 1;
      if (expr[j] === '.') {
        j += 1;
        while (j < expr.length && /[0-9]/.test(expr[j])) j += 1;
      }
      if (/[fFdD]/.test(expr[j] || '')) j += 1;
      tokens.push({ type: 'number', text: expr.slice(i, j) });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j])) j += 1;
      const ident = expr.slice(i, j);
      if (ident === 'true' || ident === 'false' || ident === 'and' || ident === 'or' || ident === 'not') {
        tokens.push({ type: ident as TokenType, text: ident });
      } else {
        tokens.push({ type: 'identifier', text: ident });
      }
      i = j;
      continue;
    }

    throw new MoonChunkError(`Unsupported character in expression: ${ch}`, line, 1);
  }

  tokens.push({ type: 'eof', text: '' });

  let pos = 0;
  const at = (): ExprToken => tokens[pos];
  const consume = (type?: TokenType): ExprToken => {
    const t = at();
    if (type && t.type !== type) {
      throw new MoonChunkError(`Expected token ${type}, got ${t.type}.`, line, 1);
    }
    pos += 1;
    return t;
  };
  const match = (...types: TokenType[]): boolean => {
    if (types.includes(at().type)) {
      pos += 1;
      return true;
    }
    return false;
  };

  const evalNumberLiteral = (text: string) => {
    if (/[fF]$/.test(text)) return makeNumeric(Number(text.slice(0, -1)), 'float');
    if (/[dD]$/.test(text)) return makeNumeric(Number(text.slice(0, -1)), 'double');
    if (text.includes('.')) return makeNumeric(Number(text), 'double');
    return makeNumeric(Number(text), 'int');
  };

  const parsePrimary = (): unknown => {
    const t = at();

    if (match('number')) return evalNumberLiteral(t.text);
    if (match('string')) return t.text;
    if (match('true')) return true;
    if (match('false')) return false;

    if (match('(')) {
      const v = parseOr();
      consume(')');
      return v;
    }

    if (match('identifier')) {
      const ident = t.text;

      if (match('(')) {
        const args: unknown[] = [];
        if (at().type !== ')') {
          args.push(parseOr());
          while (match(',')) args.push(parseOr());
        }
        consume(')');

        if (ident === 'data') {
          if (args.length !== 1) {
            throw new MoonChunkError('data(...) expects exactly one argument.', line, 1);
          }
          if (typeof args[0] !== 'string') {
            throw new MoonChunkError('data(...) expects a string path.', line, 1);
          }
          const abs = path.resolve(cwd, args[0]);
          if (!fs.existsSync(abs)) {
            throw new MoonChunkError(`Data file does not exist: ${args[0]}`, line, 1);
          }
          return normalizeJsonNumbers(JSON.parse(fs.readFileSync(abs, 'utf8')));
        }

        throw new MoonChunkError(`Unsupported function call: ${ident}(...)`, line, 1);
      }

      let value = scope.get(ident);
      if (value === undefined) value = helpers.getGlobal(ident, line);
      if (value === undefined) throw new MoonChunkError(`Unknown variable: ${ident}`, line, 1);

      while (match('.')) {
        const seg = consume('identifier').text;
        value = resolvePathValue(value, [seg]);
      }
      return value;
    }

    throw new MoonChunkError(`Unexpected token in expression: ${t.type}`, line, 1);
  };

  const parseUnary = (): unknown => {
    if (match('not')) {
      const v = parseUnary();
      if (typeof v !== 'boolean') {
        throw new MoonChunkError(`Operator not expects bool, got ${inferType(v)}.`, line, 1);
      }
      return !v;
    }
    if (match('-')) {
      const v = coerceToNumeric(parseUnary(), line);
      return makeNumeric(-v.value, v.numType);
    }
    return parsePrimary();
  };

  const parseMul = (): unknown => {
    let left = parseUnary();
    while (at().type === '*' || at().type === '/') {
      const op = consume().type;
      const a = coerceToNumeric(left, line);
      const b = coerceToNumeric(parseUnary(), line);

      if (op === '*') {
        left = makeNumeric(a.value * b.value, promoteNumericType(a.numType, b.numType));
      } else if (a.numType === 'int' && b.numType === 'int') {
        left = makeNumeric(Math.trunc(a.value / b.value), 'int');
      } else {
        left = makeNumeric(a.value / b.value, promoteNumericType(a.numType, b.numType));
      }
    }
    return left;
  };

  const parseAdd = (): unknown => {
    let left = parseMul();
    while (at().type === '+' || at().type === '-') {
      const op = consume().type;
      const right = parseMul();

      if (op === '+') {
        if (isNumericValue(left) || isNumericValue(right) || typeof left === 'number' || typeof right === 'number') {
          if (typeof left === 'string' || typeof right === 'string') {
            left = `${stringifyValue(left)}${stringifyValue(right)}`;
            continue;
          }
          const a = coerceToNumeric(left, line);
          const b = coerceToNumeric(right, line);
          left = makeNumeric(a.value + b.value, promoteNumericType(a.numType, b.numType));
          continue;
        }
        left = `${stringifyValue(left)}${stringifyValue(right)}`;
      } else {
        const a = coerceToNumeric(left, line);
        const b = coerceToNumeric(right, line);
        left = makeNumeric(a.value - b.value, promoteNumericType(a.numType, b.numType));
      }
    }
    return left;
  };

  const parseCmp = (): unknown => {
    let left = parseAdd();
    while (['<', '>', '<=', '>='].includes(at().type)) {
      const op = consume().type;
      const a = coerceToNumeric(left, line);
      const b = coerceToNumeric(parseAdd(), line);
      if (op === '<') left = a.value < b.value;
      if (op === '>') left = a.value > b.value;
      if (op === '<=') left = a.value <= b.value;
      if (op === '>=') left = a.value >= b.value;
    }
    return left;
  };

  const parseEq = (): unknown => {
    let left = parseCmp();
    while (at().type === '==' || at().type === '!=') {
      const op = consume().type;
      const right = parseCmp();
      let eq = false;

      if ((isNumericValue(left) || typeof left === 'number') && (isNumericValue(right) || typeof right === 'number')) {
        const a = coerceToNumeric(left, line);
        const b = coerceToNumeric(right, line);
        eq = a.value === b.value;
      } else {
        eq = left === right;
      }
      left = op === '==' ? eq : !eq;
    }
    return left;
  };

  const parseAnd = (): unknown => {
    let left = parseEq();
    while (match('and')) {
      const right = parseEq();
      if (typeof left !== 'boolean' || typeof right !== 'boolean') {
        throw new MoonChunkError('and expects bool operands.', line, 1);
      }
      left = left && right;
    }
    return left;
  };

  const parseOr = (): unknown => {
    let left = parseAnd();
    while (match('or')) {
      const right = parseAnd();
      if (typeof left !== 'boolean' || typeof right !== 'boolean') {
        throw new MoonChunkError('or expects bool operands.', line, 1);
      }
      left = left || right;
    }
    return left;
  };

  const result = parseOr();
  if (at().type !== 'eof') {
    throw new MoonChunkError(`Unexpected trailing token: ${at().type}`, line, 1);
  }
  return result;
}
