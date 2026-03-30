import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSiteOrFragment } from '../ast/site-loader';
import { MoonChunkError } from '../errors';
import {
  AstEnvNode,
  AstGlobalNode,
  AstNode,
  AstPageNode,
  AstSiteNode,
  ExecOptions,
  GlobalSymbol
} from '../types';
import { Scope } from './scope';
import { evalExpr } from './expression';
import { routeToOutputFile } from './route';
import { renderStringWithInterpolations, renderTemplate } from './template';
import { inferType, isAssignable } from './values';

export function runAst(ast: AstSiteNode, options: ExecOptions): { output: string[]; result: unknown; generatedFiles: string[] } {
  const cwd = options.cwd || process.cwd();
  const writeFiles = options.writeFiles !== false;

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

  function execPage(node: AstPageNode, scope: Scope, currentDir: string): void {
    const pageScope = scope.derive();
    let contentHtml = '';

    for (const statement of node.body) {
      if (!statement) continue;

      if (statement.type === 'Let') {
        const value = evalExpr(statement.expr, pageScope, currentDir, statement.line, { getGlobal });
        pageScope.declare(statement.name, value, statement.declaredType ?? null, statement.line);
      } else if (statement.type === 'Content') {
        contentHtml = renderTemplate(statement.template, pageScope, currentDir, { getGlobal });
      }
    }

    pageScope.set('content', contentHtml);

    const route = renderStringWithInterpolations(node.route, pageScope, currentDir, { getGlobal });
    const layoutPath = path.resolve(currentDir, node.layout);
    if (!fs.existsSync(layoutPath)) {
      throw new MoonChunkError(`Layout file does not exist: ${node.layout}`, node.line, 1);
    }

    const layout = fs.readFileSync(layoutPath, 'utf8');
    const html = renderTemplate(layout, pageScope, currentDir, { getGlobal });

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
    const importedAst = parseSiteOrFragment(code) as AstSiteNode;
    execList(importedAst.body, scope, path.dirname(absPath));
    importStack.delete(absPath);
  }

  function registerGlobals(nodes: Array<AstNode | null>, currentDir: string): void {
    for (const node of nodes) {
      if (!node) continue;

      if (node.type === 'Import') {
        if (!node.value.endsWith('.mncnk')) {
          throw new MoonChunkError('Imported file must use .mncnk extension.', node.line, 1);
        }

        const absPath = path.resolve(currentDir, node.value);
        if (!fs.existsSync(absPath)) {
          throw new MoonChunkError(`Imported file does not exist: ${node.value}`, node.line, 1);
        }

        if (importStack.has(absPath)) {
          throw new MoonChunkError(`Circular import detected: ${absPath}`, node.line, 1);
        }

        importStack.add(absPath);
        const importedAst = parseSiteOrFragment(fs.readFileSync(absPath, 'utf8')) as AstSiteNode;
        registerGlobals(importedAst.body, path.dirname(absPath));
        importStack.delete(absPath);
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
        continue;
      }

      if (node.type === 'Global') {
        throw new MoonChunkError('Global declaration must be inside env block.', node.line, 1);
      }
    }
  }

  function execNode(node: AstNode, scope: Scope, currentDir: string): void {
    if (node.type === 'Import') {
      execImportedFile(node.value, scope, currentDir, node.line);
      return;
    }

    if (node.type === 'Output') {
      outputDir = path.resolve(cwd, node.value);
      return;
    }

    if (node.type === 'Env' || node.type === 'Global') {
      return;
    }

    if (node.type === 'Let') {
      const value = evalExpr(node.expr, scope, currentDir, node.line, { getGlobal });
      scope.declare(node.name, value, node.declaredType ?? null, node.line);
      return;
    }

    if (node.type === 'If') {
      const cond = evalExpr(node.condition, scope, currentDir, node.line, { getGlobal });
      if (Boolean(cond)) execList(node.body, scope.derive(), currentDir);
      return;
    }

    if (node.type === 'For') {
      const data = evalExpr(node.sourceExpr, scope, currentDir, node.line, { getGlobal });
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

    throw new MoonChunkError(`Unsupported node type: ${(node as AstNode).type}`, 1, 1);
  }

  registerGlobals(ast.body, cwd);
  for (const [name] of globalSymbols) {
    evaluateGlobal(name, 1);
  }

  execList(ast.body, globalScope, cwd);
  return { output: outputLogs, result: { site: ast.name, outputDir }, generatedFiles };
}
