// @ts-nocheck
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { ANTLRErrorListener } from 'antlr4ts/ANTLRErrorListener';
import { Recognizer } from 'antlr4ts/Recognizer';
import { Token } from 'antlr4ts/Token';
import { RecognitionException } from 'antlr4ts/RecognitionException';
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';

import { MoonChunkLexer } from './.antlr/MoonChunkLexer';
import {
  MoonChunkParser,
  ProgramContext,
  SiteDeclContext,
  SiteStatementContext,
  ImportStatementContext,
  OutputStatementContext,
  LetStatementContext,
  PageStatementContext,
  PageInnerStatementContext,
  ContentStatementContext,
  ForStatementContext,
  IfStatementContext,
  ExpressionContext
} from './.antlr/MoonChunkParser';
import { MoonChunkVisitor } from './.antlr/MoonChunkVisitor';

class MoonChunkError extends Error {
  line: number;
  column: number;

  constructor(message: string, line = 1, column = 1) {
    super(message);
    this.name = 'MoonChunkError';
    this.line = line;
    this.column = column;
  }
}

type ExecOptions = {
  cwd?: string;
  writeFiles?: boolean;
};

type ExecResult = {
  ok: boolean;
  output: string[];
  result: unknown;
  diagnostics: Array<{ message: string; line: number; column: number }>;
  ast?: unknown;
  generatedFiles?: string[];
};

class SyntaxCollector implements ANTLRErrorListener<Token> {
  diagnostics: Array<{ message: string; line: number; column: number }> = [];

  syntaxError(
    _recognizer: Recognizer<Token, unknown>,
    _offendingSymbol: Token | undefined,
    line: number,
    charPositionInLine: number,
    msg: string,
    _e: RecognitionException | undefined
  ): void {
    this.diagnostics.push({ message: msg, line, column: charPositionInLine + 1 });
  }
}

class AstBuilder extends AbstractParseTreeVisitor<unknown> implements MoonChunkVisitor<unknown> {
  private tokens: CommonTokenStream;
  private sourceCode: string;

  constructor(tokens: CommonTokenStream, sourceCode: string) {
    super();
    this.tokens = tokens;
    this.sourceCode = sourceCode;
  }

  protected defaultResult(): unknown {
    return null;
  }

  private unquote(value: string): string {
    if (value.startsWith('"') && value.endsWith('"')) {
      return value.slice(1, -1);
    }
    return value;
  }

  private toExpr(ctx: ExpressionContext): string {
    const start = ctx.start.startIndex;
    const stop = ctx.stop ? ctx.stop.stopIndex : start;
    return this.sourceCode.slice(start, stop + 1).trim();
  }

  visitProgram(ctx: ProgramContext): unknown {
    return this.visit(ctx.siteDecl());
  }

  visitSiteDecl(ctx: SiteDeclContext): unknown {
    const name = this.unquote(ctx.STRING().text);
    const body = ctx.siteStatement().map((stmt) => this.visit(stmt));
    return { type: 'Site', name, body };
  }

  visitSiteStatement(ctx: SiteStatementContext): unknown {
    if (ctx.importStatement()) return this.visit(ctx.importStatement()!);
    if (ctx.outputStatement()) return this.visit(ctx.outputStatement()!);
    if (ctx.letStatement()) return this.visit(ctx.letStatement()!);
    if (ctx.pageStatement()) return this.visit(ctx.pageStatement()!);
    if (ctx.forStatement()) return this.visit(ctx.forStatement()!);
    if (ctx.ifStatement()) return this.visit(ctx.ifStatement()!);
    return null;
  }

  visitImportStatement(ctx: ImportStatementContext): unknown {
    return {
      type: 'Import',
      value: this.unquote(ctx.STRING().text),
      line: ctx.start.line
    };
  }

  visitOutputStatement(ctx: OutputStatementContext): unknown {
    return {
      type: 'Output',
      value: this.unquote(ctx.STRING().text),
      line: ctx.start.line
    };
  }

  visitLetStatement(ctx: LetStatementContext): unknown {
    const declaredType = ctx.typeName() ? ctx.typeName()!.text : null;
    return {
      type: 'Let',
      name: ctx.IDENTIFIER().text,
      declaredType,
      expr: this.toExpr(ctx.expression()),
      line: ctx.start.line
    };
  }

  visitPageStatement(ctx: PageStatementContext): unknown {
    const strings = ctx.STRING();
    const route = this.unquote(strings[0].text);
    const layout = this.unquote(strings[1].text);

    const body = ctx.pageInnerStatement().map((item) => this.visit(item));
    return {
      type: 'Page',
      route,
      layout,
      body,
      line: ctx.start.line
    };
  }

  visitPageInnerStatement(ctx: PageInnerStatementContext): unknown {
    if (ctx.letStatement()) return this.visit(ctx.letStatement()!);
    if (ctx.contentStatement()) return this.visit(ctx.contentStatement()!);
    return null;
  }

  visitContentStatement(ctx: ContentStatementContext): unknown {
    const raw = ctx.CONTENT_BLOCK().text;
    const openBrace = raw.indexOf('{');
    const closeBrace = raw.lastIndexOf('}');
    const inner = openBrace !== -1 && closeBrace !== -1 && closeBrace > openBrace
      ? raw.slice(openBrace + 1, closeBrace).replace(/^\s*\r?\n/, '').replace(/\r?\n\s*$/, '')
      : '';

    return {
      type: 'Content',
      template: inner,
      line: ctx.start.line
    };
  }

  visitForStatement(ctx: ForStatementContext): unknown {
    const body = ctx.siteStatement().map((stmt) => this.visit(stmt));
    return {
      type: 'For',
      item: ctx.IDENTIFIER().text,
      sourceExpr: this.toExpr(ctx.expression()),
      body,
      line: ctx.start.line
    };
  }

  visitIfStatement(ctx: IfStatementContext): unknown {
    const body = ctx.siteStatement().map((stmt) => this.visit(stmt));
    return {
      type: 'If',
      condition: this.toExpr(ctx.expression()),
      body,
      line: ctx.start.line
    };
  }
}

function parseProgramWithAntlr(code: string): { ast: any; diagnostics: Array<{ message: string; line: number; column: number }> } {
  const input = CharStreams.fromString(code);
  const lexer = new MoonChunkLexer(input);
  const tokens = new CommonTokenStream(lexer);
  const parser = new MoonChunkParser(tokens);

  const syntax = new SyntaxCollector();
  lexer.removeErrorListeners();
  parser.removeErrorListeners();
  lexer.addErrorListener(syntax);
  parser.addErrorListener(syntax);

  const tree = parser.program();

  if (syntax.diagnostics.length > 0) {
    return { ast: null, diagnostics: syntax.diagnostics };
  }

  const builder = new AstBuilder(tokens, code);
  const ast = builder.visit(tree);
  return { ast, diagnostics: [] };
}

function resolvePathValue(target: unknown, chain: string[]): unknown {
  let current: unknown = target;
  for (const segment of chain) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

class Scope {
  parent: Scope | null;
  values: Map<string, unknown>;
  declaredTypes: Map<string, string>;

  constructor(parent: Scope | null = null) {
    this.parent = parent;
    this.values = new Map();
    this.declaredTypes = new Map();
  }

  set(name: string, value: unknown): void {
    this.values.set(name, value);
  }

  declare(name: string, value: unknown, declaredType: string | null, line: number): void {
    if (this.values.has(name)) {
      throw new MoonChunkError(`Variable redeclaration in the same scope: ${name}`, line, 1);
    }

    if (declaredType) {
      const actual = inferType(value);
      if (!isAssignable(declaredType, actual)) {
        throw new MoonChunkError(
          `Type mismatch for ${name}: declared ${declaredType}, got ${actual}.`,
          line,
          1
        );
      }
      this.declaredTypes.set(name, declaredType);
    }

    this.values.set(name, value);
  }

  get(name: string): unknown {
    if (this.values.has(name)) return this.values.get(name);
    if (this.parent) return this.parent.get(name);
    return undefined;
  }

  derive(): Scope {
    return new Scope(this);
  }
}

type NumericType = 'int' | 'float' | 'double';
type RuntimeType = NumericType | 'bool' | 'string' | 'unknown';
type NumericValue = { __kind: 'numeric'; numType: NumericType; value: number };

function isNumericValue(value: unknown): value is NumericValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __kind?: string }).__kind === 'numeric'
  );
}

function makeNumeric(value: number, numType: NumericType): NumericValue {
  if (numType === 'int') {
    return { __kind: 'numeric', numType, value: Math.trunc(value) };
  }
  return { __kind: 'numeric', numType, value };
}

function numericRank(numType: NumericType): number {
  if (numType === 'int') return 1;
  if (numType === 'float') return 2;
  return 3;
}

function promoteNumericType(a: NumericType, b: NumericType): NumericType {
  return numericRank(a) >= numericRank(b) ? a : b;
}

function coerceToNumeric(value: unknown, line: number): NumericValue {
  if (isNumericValue(value)) return value;
  if (typeof value === 'number') {
    return makeNumeric(value, Number.isInteger(value) ? 'int' : 'double');
  }
  throw new MoonChunkError(`Expected numeric value, got ${inferType(value)}.`, line, 1);
}

function stringifyValue(value: unknown): string {
  if (isNumericValue(value)) {
    if (value.numType === 'int') return String(Math.trunc(value.value));
    if (Number.isInteger(value.value)) return value.value.toFixed(1);
    return String(value.value);
  }
  if (value === null || value === undefined) return '';
  return String(value);
}

function normalizeJsonNumbers(value: unknown): unknown {
  if (typeof value === 'number') {
    return makeNumeric(value, Number.isInteger(value) ? 'int' : 'double');
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonNumbers(item));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalizeJsonNumbers(v);
    }
    return out;
  }
  return value;
}

function inferType(value: unknown): RuntimeType {
  if (isNumericValue(value)) return value.numType;
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'string') return 'string';
  return 'unknown';
}

function isAssignable(declaredType: string, inferredType: string): boolean {
  if (declaredType === inferredType) return true;
  if (declaredType === 'double' && (inferredType === 'int' || inferredType === 'float')) return true;
  if (declaredType === 'float' && inferredType === 'int') return true;
  return false;
}

function evalExpr(rawExpr: string, scope: Scope, cwd: string, line = 1): unknown {
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

  const evalNumberLiteral = (text: string): NumericValue => {
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
      if (value === undefined) {
        throw new MoonChunkError(`Unknown variable: ${ident}`, line, 1);
      }
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
      } else {
        if (a.numType === 'int' && b.numType === 'int') {
          left = makeNumeric(Math.trunc(a.value / b.value), 'int');
        } else {
          left = makeNumeric(a.value / b.value, promoteNumericType(a.numType, b.numType));
        }
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
          if ((typeof left === 'string') || (typeof right === 'string')) {
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

function renderTemplate(template: string, scope: Scope, cwd: string): string {
  type TemplateNode =
    | { type: 'Text'; value: string }
    | { type: 'Expr'; expr: string }
    | { type: 'If'; condition: string; body: TemplateNode[] }
    | { type: 'For'; item: string; sourceExpr: string; body: TemplateNode[] };

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
        const value = evalExpr(node.expr, localScope, cwd, 1);
        out += stringifyValue(value);
      }
      if (node.type === 'If') {
        const cond = evalExpr(node.condition, localScope, cwd, 1);
        if (Boolean(cond)) out += renderNodes(node.body, localScope);
      }
      if (node.type === 'For') {
        const source = evalExpr(node.sourceExpr, localScope, cwd, 1);
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

function renderStringWithInterpolations(value: string, scope: Scope, cwd: string): string {
  return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_all, expr) => {
    const resolved = evalExpr(expr, scope, cwd, 1);
    return stringifyValue(resolved);
  });
}

function parseSiteOrFragment(code: string): any {
  const firstNonEmpty = code
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  const wrapped = firstNonEmpty && firstNonEmpty.startsWith('site ')
    ? code
    : `site "__import__" {\n${code}\n}`;

  const parsed = parseProgramWithAntlr(wrapped);
  if (parsed.diagnostics.length > 0) {
    const d = parsed.diagnostics[0];
    throw new MoonChunkError(d.message, d.line, d.column);
  }
  return parsed.ast;
}

function routeToOutputFile(route: string): string {
  const normalized = route.trim();
  if (normalized === '/' || normalized === '') return 'index.html';
  const withoutLeadingSlash = normalized.startsWith('/') ? normalized.slice(1) : normalized;
  if (withoutLeadingSlash.endsWith('/')) return `${withoutLeadingSlash}index.html`;
  if (!path.extname(withoutLeadingSlash)) return `${withoutLeadingSlash}.html`;
  return withoutLeadingSlash;
}

function runAst(ast: any, options: ExecOptions): { output: string[]; result: unknown; generatedFiles: string[] } {
  const cwd = options.cwd || process.cwd();
  const writeFiles = options.writeFiles !== false;

  const outputLogs: string[] = [];
  const generatedFiles: string[] = [];
  const globalScope = new Scope();
  let outputDir = path.resolve(cwd, 'dist');
  const importStack = new Set<string>();

  function execList(nodes: unknown[], scope: Scope, currentDir: string): void {
    for (const node of nodes as any[]) execNode(node, scope, currentDir);
  }

  function execPage(node: any, scope: Scope, currentDir: string): void {
    const pageScope = scope.derive();
    let contentHtml = '';

    for (const statement of node.body) {
      if (statement.type === 'Let') {
        const value = evalExpr(statement.expr, pageScope, currentDir, statement.line);
        pageScope.declare(statement.name, value, statement.declaredType ?? null, statement.line);
      } else if (statement.type === 'Content') {
        contentHtml = renderTemplate(statement.template, pageScope, currentDir);
      }
    }

    pageScope.set('content', contentHtml);

    const route = renderStringWithInterpolations(node.route, pageScope, currentDir);
    const layoutPath = path.resolve(currentDir, node.layout);
    if (!fs.existsSync(layoutPath)) {
      throw new MoonChunkError(`Layout file does not exist: ${node.layout}`, node.line, 1);
    }

    const layout = fs.readFileSync(layoutPath, 'utf8');
    const html = renderTemplate(layout, pageScope, currentDir);

    const relativeOut = routeToOutputFile(route);
    const absOut = path.resolve(outputDir, relativeOut);

    if (writeFiles) {
      fs.mkdirSync(path.dirname(absOut), { recursive: true });
      fs.writeFileSync(absOut, html, 'utf8');
    }

    generatedFiles.push(absOut);
    outputLogs.push(`Generated: ${absOut}`);
  }

  function execImportedFile(importPath: string, scope: Scope, currentDir: string, line: number): void {
    if (!importPath.endsWith('.mncnk')) {
      throw new MoonChunkError('Imported file must use .mncnk extension.', line, 1);
    }

    const absPath = path.resolve(currentDir, importPath);
    if (!fs.existsSync(absPath)) {
      throw new MoonChunkError(`Imported file does not exist: ${importPath}`, line, 1);
    }

    if (importStack.has(absPath)) {
      throw new MoonChunkError(`Circular import detected: ${absPath}`, line, 1);
    }

    importStack.add(absPath);
    const code = fs.readFileSync(absPath, 'utf8');
    const importedAst = parseSiteOrFragment(code);
    execList(importedAst.body, scope, path.dirname(absPath));
    importStack.delete(absPath);
  }

  function execNode(node: any, scope: Scope, currentDir: string): void {
    if (node.type === 'Import') {
      execImportedFile(node.value, scope, currentDir, node.line);
      return;
    }
    if (node.type === 'Output') {
      outputDir = path.resolve(cwd, node.value);
      return;
    }
    if (node.type === 'Let') {
      const value = evalExpr(node.expr, scope, currentDir, node.line);
      scope.declare(node.name, value, node.declaredType ?? null, node.line);
      return;
    }
    if (node.type === 'If') {
      const cond = evalExpr(node.condition, scope, currentDir, node.line);
      if (Boolean(cond)) execList(node.body, scope.derive(), currentDir);
      return;
    }
    if (node.type === 'For') {
      const data = evalExpr(node.sourceExpr, scope, currentDir, node.line);
      if (!Array.isArray(data)) throw new MoonChunkError('For source must be an array.', node.line, 1);
      for (const item of data) {
        const child = scope.derive();
        child.set(node.item, item);
        execList(node.body, child, currentDir);
      }
      return;
    }
    if (node.type === 'Page') {
      execPage(node, scope, currentDir);
      return;
    }
    throw new MoonChunkError(`Unsupported node type: ${node.type}`, 1, 1);
  }

  execList(ast.body, globalScope, cwd);
  return { output: outputLogs, result: { site: ast.name, outputDir }, generatedFiles };
}

function executeMoonChunk(code: string, options: ExecOptions = {}): ExecResult {
  try {
    const parsed = parseProgramWithAntlr(code);
    if (parsed.diagnostics.length > 0) {
      return { ok: false, output: [], result: null, diagnostics: parsed.diagnostics };
    }

    const runtime = runAst(parsed.ast, options);
    return {
      ok: true,
      output: runtime.output,
      result: runtime.result,
      generatedFiles: runtime.generatedFiles,
      diagnostics: [],
      ast: parsed.ast
    };
  } catch (error) {
    if (error instanceof MoonChunkError) {
      return {
        ok: false,
        output: [],
        result: null,
        diagnostics: [{ message: error.message, line: error.line, column: error.column }]
      };
    }

    return {
      ok: false,
      output: [],
      result: null,
      diagnostics: [{ message: error instanceof Error ? error.message : 'Unknown MoonChunk error.', line: 1, column: 1 }]
    };
  }
}

function executeMoonChunkFile(filePath: string, options: ExecOptions = {}): ExecResult {
  if (!filePath.endsWith('.mncnk')) {
    return {
      ok: false,
      output: [],
      result: null,
      diagnostics: [{ message: 'MoonChunk source file must use .mncnk extension.', line: 1, column: 1 }]
    };
  }

  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      output: [],
      result: null,
      diagnostics: [{ message: `File does not exist: ${filePath}`, line: 1, column: 1 }]
    };
  }

  const code = fs.readFileSync(filePath, 'utf8');
  const cwd = options.cwd || path.dirname(path.resolve(filePath));
  return executeMoonChunk(code, { ...options, cwd });
}

export { executeMoonChunk, executeMoonChunkFile, MoonChunkError };
