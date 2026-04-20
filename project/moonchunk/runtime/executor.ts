import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseProgramOrFragment } from '../ast/site-loader';
import { MoonChunkError } from '../errors';
import {
  AstArrowFunctionDeclarationNode,
  AstChunkNode,
  AstEnvNode,
  AstForNode,
  AstFunctionBodyNode,
  AstFunctionDeclarationNode,
  AstGlobalNode,
  AstIfNode,
  AstImportNode,
  AstNode,
  AstPageNode,
  AstProgramNode,
  AstRuntimeNode,
  ExecOptions,
  GlobalSymbol
} from '../types';
import { Scope } from './scope';
import { evalExpr, isCallable, makeCallable } from './expression';
import { routeToOutputFile } from './route';
import { renderContentTemplate, renderLayoutTemplate, renderStringWithInterpolations } from './template';
import { coerceToNumeric, inferType, isAssignable, makeNumeric } from './values';
import { formatHtmlDocument } from './format-html';

class FunctionReturn {
  constructor(public readonly value: unknown) {}
}

class BreakSignal {}
class ContinueSignal {}

export function runAst(ast: AstProgramNode, options: ExecOptions): { output: string[]; result: unknown; generatedFiles: string[] } {
  const cwd = options.cwd || process.cwd();
  const writeFiles = options.writeFiles !== false;
  const formatHtml = options.formatHtml !== false;
  const internalLayoutPath = path.resolve(__dirname, '../base.tpl');
  if (!fs.existsSync(internalLayoutPath)) {
    throw new MoonChunkError(`Internal base template does not exist: ${internalLayoutPath}`, 1, 1);
  }
  const internalLayoutTemplate = fs.readFileSync(internalLayoutPath, 'utf8');

  const outputLogs: string[] = [];
  const generatedFiles: string[] = [];
  const globalScope = new Scope();
  let outputDir = path.resolve(cwd, 'dist');

  const importStack = new Set<string>();
  const globalSymbols = new Map<string, GlobalSymbol>();
  const globalValues = new Map<string, unknown>();
  const resolvingGlobals = new Set<string>();

  const getGlobal = (name: string, line: number): unknown => {
    if (globalValues.has(name)) return globalValues.get(name);
    if (!globalSymbols.has(name)) return undefined;
    return evaluateGlobal(name, line);
  };

  function flattenProgram(program: AstProgramNode): Array<AstNode | null> {
    const statements: Array<AstNode | null> = [];
    for (const chunk of program.chunks) {
      for (const statement of chunk.body) {
        statements.push(statement as AstNode | null);
      }
    }
    return statements;
  }

  function selectImportStatements(program: AstProgramNode, importNode: AstImportNode): Array<AstNode | null> {
    if (importNode.clause.type === 'NamespaceImport') {
      return flattenProgram(program);
    }

    const selectedChunks: AstChunkNode[] = [];
    for (const item of importNode.clause.items) {
      if (item.alias && item.alias !== item.name) {
        throw new MoonChunkError(
          `Aliased named imports are not supported yet: ${item.name} as ${item.alias}.`,
          importNode.line,
          1
        );
      }
      const chunk = program.chunks.find((candidate) => candidate.name === item.name);
      if (!chunk) {
        throw new MoonChunkError(`Imported chunk "${item.name}" not found in ${importNode.source}.`, importNode.line, 1);
      }
      selectedChunks.push(chunk);
    }

    const statements: Array<AstNode | null> = [];
    for (const chunk of selectedChunks) {
      for (const statement of chunk.body) statements.push(statement as AstNode | null);
    }
    return statements;
  }

  function evaluateGlobal(name: string, line: number): unknown {
    if (globalValues.has(name)) return globalValues.get(name);

    const symbol = globalSymbols.get(name);
    if (!symbol) {
      throw new MoonChunkError(`Unknown variable: ${name}`, line, 1);
    }

    if (resolvingGlobals.has(name)) {
      throw new MoonChunkError(`Circular global dependency for variable: ${name}`, symbol.line, 1);
    }

    resolvingGlobals.add(name);
    const value = evalExpr(symbol.expr, new Scope(), symbol.dir, symbol.line, { getGlobal });
    const actual = inferType(value);
    if (symbol.declaredType && !isAssignable(symbol.declaredType, actual)) {
      throw new MoonChunkError(
        `Type mismatch for ${name}: declared ${symbol.declaredType}, got ${actual}.`,
        symbol.line,
        1
      );
    }

    globalValues.set(name, value);
    resolvingGlobals.delete(name);
    return value;
  }

  function execList(nodes: Array<AstNode | null>, scope: Scope, currentDir: string): void {
    for (const node of nodes) {
      if (!node) continue;
      execNode(node, scope, currentDir);
    }
  }

  function bindParams(
    fnScope: Scope,
    params: Array<{ name: string; declaredType: string | null }>,
    args: unknown[],
    line: number
  ): void {
    for (let i = 0; i < params.length; i += 1) {
      const param = params[i];
      const value = i < args.length ? args[i] : null;
      fnScope.declare(param.name, value, param.declaredType, line);
    }
  }

  function ensureReturnType(declaredType: string | null, value: unknown, line: number): void {
    if (!declaredType) return;
    const actual = inferType(value);
    if (!isAssignable(declaredType, actual)) {
      throw new MoonChunkError(`Type mismatch: declared ${declaredType}, got ${actual}.`, line, 1);
    }
  }

  function callArrowDeclaration(
    node: AstArrowFunctionDeclarationNode,
    scope: Scope,
    currentDir: string
  ): unknown {
    const paramsText = node.params
      .map((param) => (param.declaredType ? `${param.name}: ${param.declaredType}` : param.name))
      .join(', ');
    const source = `(${paramsText}) => ${node.bodyExpr}`;
    return evalExpr(source, scope, currentDir, node.line, { getGlobal });
  }

  function createFunctionDeclarationCallable(
    node: AstFunctionDeclarationNode,
    scope: Scope,
    currentDir: string
  ): unknown {
    return makeCallable(
      node.params,
      node.returnType,
      (args: unknown[], line: number) => {
        const fnScope = scope.derive();
        bindParams(fnScope, node.params, args, line);
        let result: unknown = null;
        try {
          executeFunctionBody(node.body, fnScope, currentDir);
        } catch (error) {
          if (error instanceof FunctionReturn) result = error.value;
          else throw error;
        }
        ensureReturnType(node.returnType, result, line);
        return result;
      },
      node.name
    );
  }

  function executeFunctionBody(body: AstFunctionBodyNode[], fnScope: Scope, currentDir: string): void {
    for (const statement of body) {
      if (statement.type === 'Let' || statement.type === 'Const') {
        const value = evalExpr(statement.expr, fnScope, currentDir, statement.line, { getGlobal });
        fnScope.declare(statement.name, value, statement.declaredType ?? null, statement.line);
        continue;
      }

      if (statement.type === 'ExpressionStatement') {
        evalExpr(statement.expr, fnScope, currentDir, statement.line, { getGlobal });
        continue;
      }

      if (statement.type === 'Return') {
        throw new FunctionReturn(evalExpr(statement.expr, fnScope, currentDir, statement.line, { getGlobal }));
      }

      if (statement.type === 'ArrowFunctionDeclaration') {
        const callable = callArrowDeclaration(statement, fnScope, currentDir);
        if (!isCallable(callable)) {
          throw new MoonChunkError(`Invalid function declaration: ${statement.name}`, statement.line, 1);
        }
        fnScope.declare(statement.name, callable, null, statement.line);
        continue;
      }

      if (statement.type === 'If') {
        execIfRuntime(statement, fnScope, currentDir, false);
        continue;
      }

      if (statement.type === 'For') {
        execForRuntime(statement, fnScope, currentDir);
        continue;
      }
    }
  }

  function execIfRuntime(node: AstIfNode, scope: Scope, currentDir: string, inLoop: boolean): void {
    const cond = evalExpr(node.condition, scope, currentDir, node.line, { getGlobal });
    if (!Boolean(cond)) return;
    const child = scope.derive();
    for (const nested of node.body) {
      if (!nested) continue;
      execRuntimeStatement(nested, child, currentDir, inLoop);
    }
  }

  function execForRuntime(node: AstForNode, scope: Scope, currentDir: string): void {
    const loopScope = scope.derive();
    const initValue = evalExpr(node.initExpr, loopScope, currentDir, node.line, { getGlobal });
    loopScope.declare(node.initName, initValue, node.initDeclaredType, node.line);

    while (Boolean(evalExpr(node.conditionExpr, loopScope, currentDir, node.line, { getGlobal }))) {
      const child = loopScope.derive();
      for (const nested of node.body) {
        if (!nested) continue;
        try {
          execRuntimeStatement(nested, child, currentDir, true);
        } catch (error) {
          if (error instanceof ContinueSignal) break;
          if (error instanceof BreakSignal) return;
          throw error;
        }
      }

      const current = coerceToNumeric(loopScope.get(node.updateName), node.line);
      loopScope.assign(node.updateName, makeNumeric(current.value + 1, current.numType), node.line);
    }
  }

  function applyMetaAssignment(scope: Scope, key: string, value: unknown, line: number): void {
    if (key === 'output') {
      outputDir = path.resolve(cwd, String(value ?? ''));
      return;
    }
    scope.declare(key, value, null, line);
  }

  function ensureLayoutDefaults(scope: Scope): void {
    const defaults: Record<string, unknown> = {
      lang: 'en',
      dir: 'ltr',
      htmlClass: '',
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1',
      title: '',
      metaDescription: '',
      metaKeywords: '',
      metaAuthor: '',
      metaRobots: 'index,follow',
      themeColor: '',
      canonicalUrl: '',
      faviconHref: '',
      appleTouchIconHref: '',
      manifestHref: '',
      ogType: 'website',
      ogTitle: '',
      ogDescription: '',
      ogImage: '',
      ogUrl: '',
      ogSiteName: '',
      ogLocale: '',
      twitterCard: 'summary',
      twitterSite: '',
      twitterCreator: '',
      twitterTitle: '',
      twitterDescription: '',
      twitterImage: '',
      preloadLinks: '',
      preconnectLinks: '',
      styles: '',
      headScripts: '',
      headExtra: '',
      bodyClass: '',
      pageId: '',
      topBar: '',
      header: '',
      footer: '',
      modals: '',
      scripts: '',
      bodyEndExtra: '',
      content: ''
    };

    for (const [key, value] of Object.entries(defaults)) {
      if (scope.get(key) === undefined) {
        scope.set(key, value);
      }
    }
  }

  function execRuntimeStatement(node: AstRuntimeNode, scope: Scope, currentDir: string, inLoop = false): void {
    if (node.type === 'Let' || node.type === 'Const') {
      const value = evalExpr(node.expr, scope, currentDir, node.line, { getGlobal });
      scope.declare(node.name, value, node.declaredType ?? null, node.line);
      return;
    }

    if (node.type === 'Meta') {
      const value = evalExpr(node.expr, scope, currentDir, node.line, { getGlobal });
      applyMetaAssignment(scope, node.name, value, node.line);
      return;
    }

    if (node.type === 'FunctionDeclaration') {
      const callable = createFunctionDeclarationCallable(node, scope, currentDir);
      if (!isCallable(callable)) {
        throw new MoonChunkError(`Invalid function declaration: ${node.name}`, node.line, 1);
      }
      scope.declare(node.name, callable, null, node.line);
      return;
    }

    if (node.type === 'ArrowFunctionDeclaration') {
      const callable = callArrowDeclaration(node, scope, currentDir);
      if (!isCallable(callable)) {
        throw new MoonChunkError(`Invalid function declaration: ${node.name}`, node.line, 1);
      }
      scope.declare(node.name, callable, null, node.line);
      return;
    }

    if (node.type === 'If') {
      execIfRuntime(node, scope, currentDir, inLoop);
      return;
    }

    if (node.type === 'For') {
      execForRuntime(node, scope, currentDir);
      return;
    }

    if (node.type === 'Break') {
      if (!inLoop) throw new MoonChunkError('break can only be used inside a loop.', node.line, 1);
      throw new BreakSignal();
    }

    if (node.type === 'Continue') {
      if (!inLoop) throw new MoonChunkError('continue can only be used inside a loop.', node.line, 1);
      throw new ContinueSignal();
    }

    if (node.type === 'Page') {
      execPage(node, scope, currentDir);
      return;
    }
  }

  function execPage(node: AstPageNode, scope: Scope, currentDir: string): void {
    const pageScope = scope.derive();
    let contentHtml = '';

    for (const statement of node.body) {
      if (!statement) continue;

      if (statement.type === 'Let' || statement.type === 'Const') {
        const value = evalExpr(statement.expr, pageScope, currentDir, statement.line, { getGlobal });
        pageScope.declare(statement.name, value, statement.declaredType ?? null, statement.line);
      } else if (statement.type === 'Meta') {
        const value = evalExpr(statement.expr, pageScope, currentDir, statement.line, { getGlobal });
        applyMetaAssignment(pageScope, statement.name, value, statement.line);
      } else if (statement.type === 'Content') {
        contentHtml = renderContentTemplate(statement.template, pageScope, currentDir, { getGlobal });
      }
    }

    pageScope.set('content', contentHtml);
    ensureLayoutDefaults(pageScope);

    const route = renderStringWithInterpolations(node.route, pageScope, currentDir, { getGlobal });
    const relativeOut = routeToOutputFile(route);
    const absOut = path.resolve(outputDir, relativeOut);
    const htmlRaw = renderLayoutTemplate(internalLayoutTemplate, pageScope, currentDir, { getGlobal });
    const html = formatHtmlDocument(htmlRaw, formatHtml, absOut);

    if (writeFiles) {
      fs.mkdirSync(path.dirname(absOut), { recursive: true });
      fs.writeFileSync(absOut, html, 'utf8');
    }

    generatedFiles.push(absOut);
    outputLogs.push(`Generated: ${absOut}`);
  }

  function loadImportedProgram(importNode: AstImportNode, currentDir: string): AstProgramNode {
    if (!importNode.source.endsWith('.mncnk')) {
      throw new MoonChunkError('Imported file must use .mncnk extension.', importNode.line, 1);
    }

    const absPath = path.resolve(currentDir, importNode.source);
    if (!fs.existsSync(absPath)) {
      throw new MoonChunkError(`Imported file does not exist: ${importNode.source}`, importNode.line, 1);
    }

    if (importStack.has(absPath)) {
      throw new MoonChunkError(`Circular import detected: ${absPath}`, importNode.line, 1);
    }

    importStack.add(absPath);
    try {
      return parseProgramOrFragment(fs.readFileSync(absPath, 'utf8'));
    } finally {
      importStack.delete(absPath);
    }
  }

  function registerGlobals(nodes: Array<AstNode | null>, currentDir: string): void {
    for (const node of nodes) {
      if (!node) continue;

      if (node.type === 'Import') {
        const importedAst = loadImportedProgram(node, currentDir);
        registerGlobals(selectImportStatements(importedAst, node), path.resolve(currentDir, path.dirname(node.source)));
        continue;
      }

      if (node.type === 'Env') {
        for (const decl of (node as AstEnvNode).body) {
          if (decl.type !== 'Global') {
            throw new MoonChunkError('Only global declarations are allowed inside env block.', decl.line || node.line, 1);
          }

          const globalDecl = decl as AstGlobalNode;
          if (globalSymbols.has(globalDecl.name)) {
            throw new MoonChunkError(`Global variable redeclaration: ${globalDecl.name}`, globalDecl.line, 1);
          }

          globalSymbols.set(globalDecl.name, {
            declaredType: globalDecl.declaredType ?? null,
            expr: globalDecl.expr,
            line: globalDecl.line,
            dir: currentDir
          });
        }
      }
    }
  }

  function execNode(node: AstNode, scope: Scope, currentDir: string): void {
    if (node.type === 'Import') {
      const importedAst = loadImportedProgram(node, currentDir);
      const importedDir = path.resolve(currentDir, path.dirname(node.source));
      execList(selectImportStatements(importedAst, node), scope, importedDir);
      return;
    }

    if (node.type === 'Output') {
      outputDir = path.resolve(cwd, node.value);
      return;
    }

    if (node.type === 'Env') {
      return;
    }

    if (node.type === 'Let' || node.type === 'Const') {
      const value = evalExpr(node.expr, scope, currentDir, node.line, { getGlobal });
      scope.declare(node.name, value, node.declaredType ?? null, node.line);
      return;
    }

    if (node.type === 'Meta') {
      const value = evalExpr(node.expr, scope, currentDir, node.line, { getGlobal });
      applyMetaAssignment(scope, node.name, value, node.line);
      return;
    }

    if (node.type === 'FunctionDeclaration') {
      const callable = createFunctionDeclarationCallable(node, scope, currentDir);
      if (!isCallable(callable)) {
        throw new MoonChunkError(`Invalid function declaration: ${node.name}`, node.line, 1);
      }
      scope.declare(node.name, callable, null, node.line);
      return;
    }

    if (node.type === 'ArrowFunctionDeclaration') {
      const callable = callArrowDeclaration(node, scope, currentDir);
      if (!isCallable(callable)) {
        throw new MoonChunkError(`Invalid function declaration: ${node.name}`, node.line, 1);
      }
      scope.declare(node.name, callable, null, node.line);
      return;
    }

    if (node.type === 'If') {
      execIfRuntime(node, scope, currentDir, false);
      return;
    }

    if (node.type === 'For') {
      execForRuntime(node, scope, currentDir);
      return;
    }

    if (node.type === 'Break') {
      throw new MoonChunkError('break can only be used inside a loop.', node.line, 1);
    }

    if (node.type === 'Continue') {
      throw new MoonChunkError('continue can only be used inside a loop.', node.line, 1);
    }

    if (node.type === 'Page') {
      execPage(node, scope, currentDir);
      return;
    }

    const unknownNode = node as { type?: string; line?: number };
    throw new MoonChunkError(`Unsupported node type: ${unknownNode.type || 'unknown'}`, unknownNode.line || 1, 1);
  }

  const rootStatements = flattenProgram(ast);
  registerGlobals(rootStatements, cwd);
  for (const [name] of globalSymbols) {
    evaluateGlobal(name, 1);
  }

  execList(rootStatements, globalScope, cwd);
  return {
    output: outputLogs,
    result: { chunks: ast.chunks.map((chunk: AstChunkNode) => chunk.name), outputDir },
    generatedFiles
  };
}
