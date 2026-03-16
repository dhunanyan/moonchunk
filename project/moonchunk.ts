// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';

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

    if (inString) {
      continue;
    }

    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;

    if (depth === 0 && expr.startsWith(operator, i)) {
      parts.push(expr.slice(start, i).trim());
      start = i + operator.length;
      i += operator.length - 1;
    }
  }

  if (parts.length === 0) {
    return null;
  }

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
    if (this.values.has(name)) {
      return this.values.get(name);
    }

    if (this.parent) {
      return this.parent.get(name);
    }

    return undefined;
  }

  derive(): Scope {
    return new Scope(this);
  }
}

function evalExpr(rawExpr: string, scope: Scope, cwd: string, line = 1): unknown {
  const expr = rawExpr.trim();

  if (!expr) {
    return null;
  }

  const eqParts = splitTopLevel(expr, '==');
  if (eqParts && eqParts.length === 2) {
    return evalExpr(eqParts[0], scope, cwd, line) === evalExpr(eqParts[1], scope, cwd, line);
  }

  const neqParts = splitTopLevel(expr, '!=');
  if (neqParts && neqParts.length === 2) {
    return evalExpr(neqParts[0], scope, cwd, line) !== evalExpr(neqParts[1], scope, cwd, line);
  }

  const plusParts = splitTopLevel(expr, '+');
  if (plusParts && plusParts.length > 1) {
    return plusParts
      .map((part) => evalExpr(part, scope, cwd, line))
      .reduce((acc, val) => {
        if (typeof acc === 'number' && typeof val === 'number') {
          return acc + val;
        }
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
    const json = fs.readFileSync(abs, 'utf8');
    return JSON.parse(json);
  }

  if (expr === 'true') return true;
  if (expr === 'false') return false;

  if (/^-?\d+(\.\d+)?$/.test(expr)) {
    return Number(expr);
  }

  if (expr.startsWith('"') && expr.endsWith('"')) {
    return expr.slice(1, -1);
  }

  if ((expr.startsWith('(') && expr.endsWith(')'))) {
    return evalExpr(expr.slice(1, -1), scope, cwd, line);
  }

  if (/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(expr)) {
    const [root, ...rest] = expr.split('.');
    const rootValue = scope.get(root);
    if (rootValue === undefined) {
      throw new MoonChunkError(`Unknown variable: ${root}`, line, 1);
    }
    if (rest.length === 0) {
      return rootValue;
    }
    return resolvePathValue(rootValue, rest);
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
        if (close === -1) {
          throw new MoonChunkError('Unclosed {{ ... }} in template.', 1, 1);
        }
        nodes.push({ type: 'Expr', expr: template.slice(nextPos + 2, close).trim() });
        pos = close + 2;
        continue;
      }

      const close = template.indexOf('%}', nextPos + 2);
      if (close === -1) {
        throw new MoonChunkError('Unclosed {% ... %} in template.', 1, 1);
      }

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
        if (!m) {
          throw new MoonChunkError(`Invalid template for tag: ${tag}`, 1, 1);
        }
        const inner = parseNodes(pos, 'endfor');
        nodes.push({ type: 'For', item: m[1], sourceExpr: m[2], body: inner.nodes });
        pos = inner.pos;
        continue;
      }

      if (tag === 'endif' || tag === 'endfor') {
        throw new MoonChunkError(`Unexpected template tag: ${tag}`, 1, 1);
      }

      throw new MoonChunkError(`Unsupported template tag: ${tag}`, 1, 1);
    }

    if (endTag) {
      throw new MoonChunkError(`Missing template closing tag: ${endTag}`, 1, 1);
    }

    return { nodes, pos };
  }

  function renderNodes(nodes: TemplateNode[], localScope: Scope): string {
    let out = '';
    for (const node of nodes) {
      if (node.type === 'Text') {
        out += node.value;
        continue;
      }
      if (node.type === 'Expr') {
        const value = evalExpr(node.expr, localScope, cwd, 1);
        out += value === null || value === undefined ? '' : String(value);
        continue;
      }
      if (node.type === 'If') {
        const cond = evalExpr(node.condition, localScope, cwd, 1);
        if (Boolean(cond)) {
          out += renderNodes(node.body, localScope);
        }
        continue;
      }
      if (node.type === 'For') {
        const source = evalExpr(node.sourceExpr, localScope, cwd, 1);
        if (!Array.isArray(source)) {
          throw new MoonChunkError('Template for-loop requires array value.', 1, 1);
        }
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

function parseQuoted(input: string, line: number): string {
  const trimmed = input.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    throw new MoonChunkError('Expected quoted string.', line, 1);
  }
  return trimmed.slice(1, -1);
}

function parseProgram(code: string): unknown {
  const lines = code.split(/\r?\n/);
  let i = 0;

  function currentLineNo(): number {
    return i + 1;
  }

  function skipEmpty(): void {
    while (i < lines.length && lines[i].trim() === '') {
      i += 1;
    }
  }

  function parseBlock(parser: () => unknown): unknown[] {
    const body: unknown[] = [];
    while (i < lines.length) {
      skipEmpty();
      if (i >= lines.length) break;
      const t = lines[i].trim();
      if (t === '}') {
        i += 1;
        break;
      }
      body.push(parser());
    }
    return body;
  }

  function parseLet(line: string): unknown {
    const m = line.match(/^let\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (!m) {
      throw new MoonChunkError('Invalid let statement.', currentLineNo(), 1);
    }
    return { type: 'Let', name: m[1], expr: m[2], line: currentLineNo() };
  }

  function parseContent(): unknown {
    const startLine = currentLineNo();
    const first = lines[i].trim();
    if (first !== 'content {') {
      throw new MoonChunkError('Expected content {', currentLineNo(), 1);
    }
    i += 1;
    const chunks: string[] = [];
    while (i < lines.length && lines[i].trim() !== '}') {
      chunks.push(lines[i]);
      i += 1;
    }
    if (i >= lines.length) {
      throw new MoonChunkError('Unclosed content block.', startLine, 1);
    }
    i += 1;
    return { type: 'Content', template: chunks.join('\n'), line: startLine };
  }

  function parsePage(line: string): unknown {
    const m = line.match(/^page\s+(".*")\s+using\s+(".*")\s*\{$/);
    if (!m) {
      throw new MoonChunkError('Invalid page declaration.', currentLineNo(), 1);
    }

    const route = parseQuoted(m[1], currentLineNo());
    const layout = parseQuoted(m[2], currentLineNo());
    i += 1;

    const body: unknown[] = [];
    while (i < lines.length) {
      skipEmpty();
      if (i >= lines.length) break;
      const t = lines[i].trim();
      if (t === '}') {
        i += 1;
        break;
      }
      if (t.startsWith('let ')) {
        body.push(parseLet(t));
        i += 1;
        continue;
      }
      if (t === 'content {') {
        body.push(parseContent());
        continue;
      }
      throw new MoonChunkError(`Unsupported page statement: ${t}`, currentLineNo(), 1);
    }

    return { type: 'Page', route, layout, body, line: currentLineNo() };
  }

  function parseIf(line: string, parser: () => unknown): unknown {
    const m = line.match(/^if\s+(.+)\s*\{$/);
    if (!m) {
      throw new MoonChunkError('Invalid if statement.', currentLineNo(), 1);
    }
    const condition = m[1];
    i += 1;
    const body = parseBlock(parser);
    return { type: 'If', condition, body, line: currentLineNo() };
  }

  function parseFor(line: string, parser: () => unknown): unknown {
    const m = line.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+)\s*\{$/);
    if (!m) {
      throw new MoonChunkError('Invalid for statement.', currentLineNo(), 1);
    }
    i += 1;
    const body = parseBlock(parser);
    return { type: 'For', item: m[1], sourceExpr: m[2], body, line: currentLineNo() };
  }

  function parseSiteStmt(): unknown {
    const line = lines[i].trim();

    if (line.startsWith('output ')) {
      const value = parseQuoted(line.slice('output '.length), currentLineNo());
      i += 1;
      return { type: 'Output', value, line: currentLineNo() };
    }

    if (line.startsWith('let ')) {
      i += 1;
      return parseLet(line);
    }

    if (line.startsWith('page ')) {
      return parsePage(line);
    }

    if (line.startsWith('for ')) {
      return parseFor(line, parseSiteStmt);
    }

    if (line.startsWith('if ')) {
      return parseIf(line, parseSiteStmt);
    }

    throw new MoonChunkError(`Unsupported site statement: ${line}`, currentLineNo(), 1);
  }

  skipEmpty();
  if (i >= lines.length) {
    throw new MoonChunkError('Program is empty.', 1, 1);
  }

  const siteHeader = lines[i].trim();
  const siteMatch = siteHeader.match(/^site\s+(".*")\s*\{$/);
  if (!siteMatch) {
    throw new MoonChunkError('Program must start with site "Name" {', currentLineNo(), 1);
  }

  const siteName = parseQuoted(siteMatch[1], currentLineNo());
  i += 1;

  const body = parseBlock(parseSiteStmt);
  return { type: 'Site', name: siteName, body };
}

function routeToOutputFile(route: string): string {
  const normalized = route.trim();
  if (normalized === '/' || normalized === '') {
    return 'index.html';
  }
  const withoutLeadingSlash = normalized.startsWith('/') ? normalized.slice(1) : normalized;
  if (withoutLeadingSlash.endsWith('/')) {
    return `${withoutLeadingSlash}index.html`;
  }
  if (!path.extname(withoutLeadingSlash)) {
    return `${withoutLeadingSlash}.html`;
  }
  return withoutLeadingSlash;
}

function runAst(ast: any, options: ExecOptions): { output: string[]; result: unknown; generatedFiles: string[] } {
  const cwd = options.cwd || process.cwd();
  const writeFiles = options.writeFiles !== false;

  const outputLogs: string[] = [];
  const generatedFiles: string[] = [];
  const globalScope = new Scope();

  let outputDir = path.resolve(cwd, 'dist');

  function execList(nodes: unknown[], scope: Scope): void {
    for (const node of nodes as any[]) {
      execNode(node, scope);
    }
  }

  function execPage(node: any, scope: Scope): void {
    const pageScope = scope.derive();
    let contentHtml = '';

    for (const statement of node.body) {
      if (statement.type === 'Let') {
        const value = evalExpr(statement.expr, pageScope, cwd, statement.line);
        pageScope.set(statement.name, value);
      } else if (statement.type === 'Content') {
        contentHtml = renderTemplate(statement.template, pageScope, cwd);
      } else {
        throw new MoonChunkError(`Unsupported page statement type: ${statement.type}`, 1, 1);
      }
    }

    pageScope.set('content', contentHtml);

    const route = renderStringWithInterpolations(node.route, pageScope, cwd);
    const layoutPath = path.resolve(cwd, node.layout);
    if (!fs.existsSync(layoutPath)) {
      throw new MoonChunkError(`Layout file does not exist: ${node.layout}`, node.line, 1);
    }

    const layout = fs.readFileSync(layoutPath, 'utf8');
    const html = renderTemplate(layout, pageScope, cwd);

    const relativeOut = routeToOutputFile(route);
    const absOut = path.resolve(outputDir, relativeOut);

    if (writeFiles) {
      fs.mkdirSync(path.dirname(absOut), { recursive: true });
      fs.writeFileSync(absOut, html, 'utf8');
    }

    generatedFiles.push(absOut);
    outputLogs.push(`Generated: ${absOut}`);
  }

  function execNode(node: any, scope: Scope): void {
    if (node.type === 'Output') {
      outputDir = path.resolve(cwd, node.value);
      return;
    }

    if (node.type === 'Let') {
      scope.set(node.name, evalExpr(node.expr, scope, cwd, node.line));
      return;
    }

    if (node.type === 'If') {
      const cond = evalExpr(node.condition, scope, cwd, node.line);
      if (Boolean(cond)) {
        execList(node.body, scope.derive());
      }
      return;
    }

    if (node.type === 'For') {
      const data = evalExpr(node.sourceExpr, scope, cwd, node.line);
      if (!Array.isArray(data)) {
        throw new MoonChunkError('For source must be an array.', node.line, 1);
      }
      for (const item of data) {
        const child = scope.derive();
        child.set(node.item, item);
        execList(node.body, child);
      }
      return;
    }

    if (node.type === 'Page') {
      execPage(node, scope);
      return;
    }

    throw new MoonChunkError(`Unsupported node type: ${node.type}`, 1, 1);
  }

  execList(ast.body, globalScope);

  return {
    output: outputLogs,
    result: { site: ast.name, outputDir },
    generatedFiles
  };
}

function executeMoonChunk(code: string, options: ExecOptions = {}): ExecResult {
  try {
    const ast = parseProgram(code);
    const runtime = runAst(ast, options);

    return {
      ok: true,
      output: runtime.output,
      result: runtime.result,
      generatedFiles: runtime.generatedFiles,
      diagnostics: [],
      ast
    };
  } catch (error) {
    if (error instanceof MoonChunkError) {
      return {
        ok: false,
        output: [],
        result: null,
        diagnostics: [
          {
            message: error.message,
            line: error.line,
            column: error.column
          }
        ]
      };
    }

    return {
      ok: false,
      output: [],
      result: null,
      diagnostics: [
        {
          message: error instanceof Error ? error.message : 'Unknown MoonChunk error.',
          line: 1,
          column: 1
        }
      ]
    };
  }
}

function executeMoonChunkFile(filePath: string, options: ExecOptions = {}): ExecResult {
  if (!filePath.endsWith('.mnchnk')) {
    return {
      ok: false,
      output: [],
      result: null,
      diagnostics: [
        {
          message: 'MoonChunk source file must use .mnchnk extension.',
          line: 1,
          column: 1
        }
      ]
    };
  }

  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      output: [],
      result: null,
      diagnostics: [
        {
          message: `File does not exist: ${filePath}`,
          line: 1,
          column: 1
        }
      ]
    };
  }

  const code = fs.readFileSync(filePath, 'utf8');
  const cwd = options.cwd || path.dirname(path.resolve(filePath));
  return executeMoonChunk(code, { ...options, cwd });
}

export { executeMoonChunk, executeMoonChunkFile, MoonChunkError };
