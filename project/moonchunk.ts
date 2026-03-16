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
    return ctx.text;
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
    return {
      type: 'Let',
      name: ctx.IDENTIFIER().text,
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

  const builder = new AstBuilder();
  const ast = builder.visit(tree);
  return { ast, diagnostics: [] };
}

function splitTopLevel(expr: string, operator: string): string[] | null {
  let depth = 0;
  let inString = false;
  const parts: string[] = [];
  let start = 0;

  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i];
    const prev = i > 0 ? expr[i - 1] : '';

    if (ch === '"' && prev !== '\\') {
      inString = !inString;
      continue;
    }

    if (inString) continue;
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;

    if (depth === 0 && expr.startsWith(operator, i)) {
      parts.push(expr.slice(start, i).trim());
      start = i + operator.length;
      i += operator.length - 1;
    }
  }

  if (parts.length === 0) return null;
  parts.push(expr.slice(start).trim());
  return parts;
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

  constructor(parent: Scope | null = null) {
    this.parent = parent;
    this.values = new Map();
  }

  set(name: string, value: unknown): void {
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

function evalExpr(rawExpr: string, scope: Scope, cwd: string, line = 1): unknown {
  const expr = rawExpr.trim();
  if (!expr) return null;

  const eq = splitTopLevel(expr, '==');
  if (eq && eq.length === 2) return evalExpr(eq[0], scope, cwd, line) === evalExpr(eq[1], scope, cwd, line);

  const neq = splitTopLevel(expr, '!=');
  if (neq && neq.length === 2) return evalExpr(neq[0], scope, cwd, line) !== evalExpr(neq[1], scope, cwd, line);

  const plus = splitTopLevel(expr, '+');
  if (plus && plus.length > 1) {
    return plus
      .map((part) => evalExpr(part, scope, cwd, line))
      .reduce((acc, val) => {
        if (typeof acc === 'number' && typeof val === 'number') return acc + val;
        return `${String(acc)}${String(val)}`;
      });
  }

  if (expr.startsWith('data(') && expr.endsWith(')')) {
    const arg = expr.slice(5, -1).trim();
    const filePath = evalExpr(arg, scope, cwd, line);
    if (typeof filePath !== 'string') {
      throw new MoonChunkError('data(...) expects a string path.', line, 1);
    }
    const abs = path.resolve(cwd, filePath);
    if (!fs.existsSync(abs)) {
      throw new MoonChunkError(`Data file does not exist: ${filePath}`, line, 1);
    }
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  }

  if (expr === 'true') return true;
  if (expr === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);

  if (expr.startsWith('"') && expr.endsWith('"')) {
    return expr.slice(1, -1);
  }

  if (expr.startsWith('(') && expr.endsWith(')')) {
    return evalExpr(expr.slice(1, -1), scope, cwd, line);
  }

  if (/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(expr)) {
    const [root, ...rest] = expr.split('.');
    const rootValue = scope.get(root);
    if (rootValue === undefined) {
      throw new MoonChunkError(`Unknown variable: ${root}`, line, 1);
    }
    return rest.length === 0 ? rootValue : resolvePathValue(rootValue, rest);
  }

  throw new MoonChunkError(`Unsupported expression: ${expr}`, line, 1);
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
        out += value === null || value === undefined ? '' : String(value);
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
    return resolved === null || resolved === undefined ? '' : String(resolved);
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
        pageScope.set(statement.name, evalExpr(statement.expr, pageScope, currentDir, statement.line));
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
      scope.set(node.name, evalExpr(node.expr, scope, currentDir, node.line));
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
