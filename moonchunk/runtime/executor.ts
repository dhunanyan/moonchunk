import * as fs from "node:fs";
import * as path from "node:path";
import { parseProgramOrFragment } from "../ast/site-loader";
import { MoonChunkError } from "../errors";
import {
  AstArrowFunctionDeclarationNode,
  AstChunkNode,
  AstEnvNode,
  AstForNode,
  AstWhileNode,
  AstFunctionBodyNode,
  AstFunctionDeclarationNode,
  AstGlobalNode,
  AstIfNode,
  AstImportNode,
  AstMoonNode,
  AstNode,
  AstPageNode,
  AstProgramNode,
  AstRuntimeNode,
  ExecOptions,
  GlobalSymbol,
} from "../types";
import { Scope } from "./scope";
import { evalExpr, isCallable, makeCallable } from "./expression";
import { routeToOutputFile } from "./route";
import {
  renderContentTemplate,
  renderLayoutTemplate,
  renderStringWithInterpolations,
} from "./template";
import {
  coerceToNumeric,
  inferType,
  isAssignable,
  makeNumeric,
} from "./values";
import { formatHtmlDocument } from "./format-html";

class FunctionReturn {
  constructor(public readonly value: unknown) {}
}

class BreakSignal {}
class ContinueSignal {}

type ProgramBindings = {
  dir: string;
  localChunks: Map<string, AstChunkNode>;
  namedImports: Map<string, AstChunkNode>;
  namespaceImports: Map<string, Map<string, AstChunkNode>>;
};

function toChunkObject(chunk: AstChunkNode): Record<string, unknown> {
  return {
    __kind: "chunk",
    name: chunk.name,
    exported: chunk.exported,
    includes: chunk.includes.map((node) => node.targetPath),
    line: chunk.line,
  };
}

export function runAst(
  ast: AstProgramNode,
  options: ExecOptions,
): { output: string[]; result: unknown; generatedFiles: string[] } {
  const cwd = options.cwd || process.cwd();
  const writeFiles = options.writeFiles !== false;
  const formatHtml = options.formatHtml !== false;
  const internalLayoutPath = path.resolve(__dirname, "../base.tpl");
  if (!fs.existsSync(internalLayoutPath)) {
    throw new MoonChunkError(
      `Internal base template does not exist: ${internalLayoutPath}`,
      1,
      1,
    );
  }
  const internalLayoutTemplate = fs.readFileSync(internalLayoutPath, "utf8");

  const outputLogs: string[] = [];
  const generatedFiles: string[] = [];
  const globalScope = new Scope();
  let outputDir = path.resolve(cwd, "dist");

  const importStack = new Set<string>();
  const globalSymbols = new Map<string, GlobalSymbol>();
  const globalValues = new Map<string, unknown>();
  const resolvingGlobals = new Set<string>();
  const metadataDefaults = new Map<string, unknown>();
  const loadedProgramCache = new Map<string, AstProgramNode>();
  const programBindings = new WeakMap<AstProgramNode, ProgramBindings>();
  const chunkBindings = new WeakMap<AstChunkNode, ProgramBindings>();

  const getGlobal = (name: string, line: number): unknown => {
    if (globalValues.has(name)) return globalValues.get(name);
    if (!globalSymbols.has(name)) return undefined;
    return evaluateGlobal(name, line);
  };

  function selectImportChunks(
    program: AstProgramNode,
    importNode: AstImportNode,
  ): AstChunkNode[] {
    if (importNode.clause.type === "NamespaceImport") {
      const notExported = program.chunks.find((chunk) => !chunk.exported);
      if (notExported) {
        throw new MoonChunkError(
          `Imported chunk "${notExported.name}" is not exported in ${importNode.source}.`,
          importNode.line,
          1,
        );
      }
      return program.chunks.filter((chunk) => chunk.exported);
    }

    const selectedChunks: AstChunkNode[] = [];
    for (const item of importNode.clause.items) {
      const chunk = program.chunks.find(
        (candidate) => candidate.name === item.name,
      );
      if (!chunk) {
        throw new MoonChunkError(
          `Imported chunk "${item.name}" not found in ${importNode.source}.`,
          importNode.line,
          1,
        );
      }
      if (!chunk.exported) {
        throw new MoonChunkError(
          `Imported chunk "${item.name}" is not exported in ${importNode.source}.`,
          importNode.line,
          1,
        );
      }
      selectedChunks.push(chunk);
    }

    return selectedChunks;
  }

  function evaluateGlobal(name: string, line: number): unknown {
    if (globalValues.has(name)) return globalValues.get(name);

    const symbol = globalSymbols.get(name);
    if (!symbol) {
      throw new MoonChunkError(`Unknown variable: ${name}`, line, 1);
    }

    if (resolvingGlobals.has(name)) {
      throw new MoonChunkError(
        `Circular global dependency for variable: ${name}`,
        symbol.line,
        1,
      );
    }

    resolvingGlobals.add(name);
    const value = evalExpr(symbol.expr, new Scope(), symbol.dir, symbol.line, {
      getGlobal,
    });
    const actual = inferType(value);
    if (symbol.declaredType && !isAssignable(symbol.declaredType, actual)) {
      throw new MoonChunkError(
        `Type mismatch for ${name}: declared ${symbol.declaredType}, got ${actual}.`,
        symbol.line,
        1,
      );
    }

    globalValues.set(name, value);
    resolvingGlobals.delete(name);
    return value;
  }

  function execList(
    nodes: Array<AstNode | null>,
    scope: Scope,
    currentDir: string,
  ): void {
    for (const node of nodes) {
      if (!node) continue;
      execNode(node, scope, currentDir);
    }
  }

  function bindParams(
    fnScope: Scope,
    params: Array<{ name: string; declaredType: string | null }>,
    args: unknown[],
    line: number,
  ): void {
    for (let i = 0; i < params.length; i += 1) {
      const param = params[i];
      const value = i < args.length ? args[i] : null;
      fnScope.declare(param.name, value, param.declaredType, line);
    }
  }

  function ensureReturnType(
    declaredType: string | null,
    value: unknown,
    line: number,
  ): void {
    if (!declaredType) return;
    const actual = inferType(value);
    if (!isAssignable(declaredType, actual)) {
      throw new MoonChunkError(
        `Type mismatch: declared ${declaredType}, got ${actual}.`,
        line,
        1,
      );
    }
  }

  function callArrowDeclaration(
    node: AstArrowFunctionDeclarationNode,
    scope: Scope,
    currentDir: string,
  ): unknown {
    const paramsText = node.params
      .map((param) =>
        param.declaredType
          ? `${param.name}: ${param.declaredType}`
          : param.name,
      )
      .join(", ");
    const source = `(${paramsText}) => ${node.bodyExpr}`;
    return evalExpr(source, scope, currentDir, node.line, { getGlobal });
  }

  function createFunctionDeclarationCallable(
    node: AstFunctionDeclarationNode,
    scope: Scope,
    currentDir: string,
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
      node.name,
    );
  }

  function executeFunctionBody(
    body: AstFunctionBodyNode[],
    fnScope: Scope,
    currentDir: string,
  ): void {
    for (const statement of body) {
      switch (statement.type) {
        case "Let":
        case "Const": {
          const value = evalExpr(
            statement.expr,
            fnScope,
            currentDir,
            statement.line,
            { getGlobal },
          );
          fnScope.declare(
            statement.name,
            value,
            statement.declaredType ?? null,
            statement.line,
            statement.type === "Let",
          );
          break;
        }
        case "ExpressionStatement":
          evalExpr(statement.expr, fnScope, currentDir, statement.line, {
            getGlobal,
          });
          break;
        case "Return": {
          const value =
            statement.expr === null
              ? null
              : evalExpr(statement.expr, fnScope, currentDir, statement.line, {
                  getGlobal,
                });
          throw new FunctionReturn(value);
        }
        case "ArrowFunctionDeclaration": {
          const callable = callArrowDeclaration(statement, fnScope, currentDir);
          if (!isCallable(callable)) {
            throw new MoonChunkError(
              `Invalid function declaration: ${statement.name}`,
              statement.line,
              1,
            );
          }
          fnScope.declare(statement.name, callable, null, statement.line);
          break;
        }
        case "FunctionDeclaration": {
          const callable = createFunctionDeclarationCallable(
            statement,
            fnScope,
            currentDir,
          );
          if (!isCallable(callable)) {
            throw new MoonChunkError(
              `Invalid function declaration: ${statement.name}`,
              statement.line,
              1,
            );
          }
          fnScope.declare(statement.name, callable, null, statement.line);
          break;
        }
        case "If":
          execIfRuntime(statement, fnScope, currentDir, false);
          break;
        case "For":
          execForRuntime(statement, fnScope, currentDir);
          break;
        case "While":
          execWhileRuntime(statement, fnScope, currentDir);
          break;
      }
    }
  }

  function execIfRuntime(
    node: AstIfNode,
    scope: Scope,
    currentDir: string,
    inLoop: boolean,
  ): void {
    const cond = evalExpr(node.condition, scope, currentDir, node.line, {
      getGlobal,
    });
    const selectedBody = Boolean(cond) ? node.body : node.elseBody;
    if (!selectedBody) return;
    const child = scope.derive();
    for (const nested of selectedBody) {
      if (!nested) continue;
      execRuntimeStatement(nested, child, currentDir, inLoop);
    }
  }

  function execForRuntime(
    node: AstForNode,
    scope: Scope,
    currentDir: string,
  ): void {
    const loopScope = scope.derive();
    const initValue = evalExpr(
      node.initExpr,
      loopScope,
      currentDir,
      node.line,
      { getGlobal },
    );
    loopScope.declare(
      node.initName,
      initValue,
      node.initDeclaredType,
      node.line,
    );

    while (
      Boolean(
        evalExpr(node.conditionExpr, loopScope, currentDir, node.line, {
          getGlobal,
        }),
      )
    ) {
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

      const current = coerceToNumeric(
        loopScope.get(node.updateName),
        node.line,
      );
      loopScope.assign(
        node.updateName,
        makeNumeric(current.value + 1, current.numType),
        node.line,
      );
    }
  }

  function execWhileRuntime(
    node: AstWhileNode,
    scope: Scope,
    currentDir: string,
  ): void {
    const loopScope = scope.derive();
    while (
      Boolean(
        evalExpr(node.condition, scope, currentDir, node.line, {
          getGlobal,
        }),
      )
    ) {
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
    }
  }

  function applyChunkMetaAssignment(
    scope: Scope,
    key: string,
    value: unknown,
    line: number,
  ): void {
    if (key === "output") {
      outputDir = path.resolve(cwd, String(value ?? ""));
      return;
    }
    metadataDefaults.set(key, value);
    scope.declare(key, value, null, line);
  }

  function applyPageMetaAssignment(
    scope: Scope,
    key: string,
    value: unknown,
    line: number,
  ): void {
    if (key === "output") {
      outputDir = path.resolve(cwd, String(value ?? ""));
      return;
    }
    scope.declare(key, value, null, line);
  }

  function ensureLayoutDefaults(scope: Scope): void {
    const defaults: Record<string, unknown> = {
      lang: "en",
      dir: "ltr",
      htmlClass: "",
      charset: "utf-8",
      viewport: "width=device-width, initial-scale=1",
      title: "",
      metaDescription: "",
      metaKeywords: "",
      metaAuthor: "",
      metaRobots: "index,follow",
      themeColor: "",
      canonicalUrl: "",
      faviconHref: "",
      appleTouchIconHref: "",
      manifestHref: "",
      ogType: "website",
      ogTitle: "",
      ogDescription: "",
      ogImage: "",
      ogUrl: "",
      ogSiteName: "",
      ogLocale: "",
      twitterCard: "summary",
      twitterSite: "",
      twitterCreator: "",
      twitterTitle: "",
      twitterDescription: "",
      twitterImage: "",
      preloadLinks: "",
      preconnectLinks: "",
      styles: "",
      headScripts: "",
      headExtra: "",
      bodyClass: "",
      pageId: "",
      topBar: "",
      header: "",
      footer: "",
      modals: "",
      scripts: "",
      bodyEndExtra: "",
      content: "",
    };

    for (const [key, value] of Object.entries(defaults)) {
      if (scope.get(key) === undefined) {
        scope.set(key, value);
      }
    }
  }

  function applyMetadataDefaults(scope: Scope): void {
    for (const [key, value] of metadataDefaults.entries()) {
      scope.set(key, value);
    }
  }

  function execRuntimeStatement(
    node: AstRuntimeNode,
    scope: Scope,
    currentDir: string,
    inLoop = false,
  ): void {
    switch (node.type) {
      case "Let":
      case "Const": {
        const value = evalExpr(node.expr, scope, currentDir, node.line, {
          getGlobal,
        });
        scope.declare(
          node.name,
          value,
          node.declaredType ?? null,
          node.line,
          node.type === "Let",
        );
        return;
      }
      case "ExpressionStatement":
        evalExpr(node.expr, scope, currentDir, node.line, { getGlobal });
        return;
      case "Meta": {
        const value = evalExpr(node.expr, scope, currentDir, node.line, {
          getGlobal,
        });
        applyChunkMetaAssignment(scope, node.name, value, node.line);
        return;
      }
      case "FunctionDeclaration": {
        const callable = createFunctionDeclarationCallable(
          node,
          scope,
          currentDir,
        );
        if (!isCallable(callable)) {
          throw new MoonChunkError(
            `Invalid function declaration: ${node.name}`,
            node.line,
            1,
          );
        }
        scope.declare(node.name, callable, null, node.line);
        return;
      }
      case "ArrowFunctionDeclaration": {
        const callable = callArrowDeclaration(node, scope, currentDir);
        if (!isCallable(callable)) {
          throw new MoonChunkError(
            `Invalid function declaration: ${node.name}`,
            node.line,
            1,
          );
        }
        scope.declare(node.name, callable, null, node.line);
        return;
      }
      case "If":
        execIfRuntime(node, scope, currentDir, inLoop);
        return;
      case "For":
        execForRuntime(node, scope, currentDir);
        return;
      case "While":
        execWhileRuntime(node, scope, currentDir);
        return;
      case "Break":
        if (!inLoop) {
          throw new MoonChunkError(
            "break can only be used inside a loop.",
            node.line,
            1,
          );
        }
        throw new BreakSignal();
      case "Continue":
        if (!inLoop) {
          throw new MoonChunkError(
            "continue can only be used inside a loop.",
            node.line,
            1,
          );
        }
        throw new ContinueSignal();
      case "Page":
        execPage(node, scope, currentDir);
        return;
    }
  }

  function execPage(node: AstPageNode, scope: Scope, currentDir: string): void {
    const pageScope = scope.derive();
    applyMetadataDefaults(pageScope);
    let contentHtml = "";

    for (const statement of node.body) {
      if (!statement) continue;

      if (statement.type === "Let" || statement.type === "Const") {
        const value = evalExpr(
          statement.expr,
          pageScope,
          currentDir,
          statement.line,
          { getGlobal },
        );
        pageScope.declare(
          statement.name,
          value,
          statement.declaredType ?? null,
          statement.line,
          statement.type === "Let",
        );
      } else if (statement.type === "Meta") {
        const value = evalExpr(
          statement.expr,
          pageScope,
          currentDir,
          statement.line,
          { getGlobal },
        );
        applyPageMetaAssignment(
          pageScope,
          statement.name,
          value,
          statement.line,
        );
      } else if (statement.type === "Content") {
        contentHtml = renderContentTemplate(
          statement.template,
          pageScope,
          currentDir,
          { getGlobal },
        );
      }
    }

    pageScope.set("content", contentHtml);
    ensureLayoutDefaults(pageScope);

    const route = renderStringWithInterpolations(
      node.route,
      pageScope,
      currentDir,
      { getGlobal },
    );
    const relativeOut = routeToOutputFile(route);
    const absOut = path.resolve(outputDir, relativeOut);
    const htmlRaw = renderLayoutTemplate(
      internalLayoutTemplate,
      pageScope,
      currentDir,
      { getGlobal },
    );
    const html = formatHtmlDocument(htmlRaw, formatHtml, absOut);

    if (writeFiles) {
      fs.mkdirSync(path.dirname(absOut), { recursive: true });
      fs.writeFileSync(absOut, html, "utf8");
    }

    generatedFiles.push(absOut);
    outputLogs.push(`Generated: ${absOut}`);
  }

  function loadImportedProgram(
    importNode: AstImportNode,
    currentDir: string,
  ): AstProgramNode {
    if (!importNode.source.endsWith(".mncnk")) {
      throw new MoonChunkError(
        "Imported file must use .mncnk extension.",
        importNode.line,
        1,
      );
    }

    const absPath = path.resolve(currentDir, importNode.source);
    if (!fs.existsSync(absPath)) {
      throw new MoonChunkError(
        `Imported file does not exist: ${importNode.source}`,
        importNode.line,
        1,
      );
    }

    const cached = loadedProgramCache.get(absPath);
    if (cached) return cached;

    if (importStack.has(absPath)) {
      throw new MoonChunkError(
        `Circular import detected: ${absPath}`,
        importNode.line,
        1,
      );
    }

    importStack.add(absPath);
    try {
      const parsed = parseProgramOrFragment(fs.readFileSync(absPath, "utf8"));
      loadedProgramCache.set(absPath, parsed);
      return parsed;
    } finally {
      importStack.delete(absPath);
    }
  }

  function getProgramBindings(
    program: AstProgramNode,
    currentDir: string,
  ): ProgramBindings {
    const existing = programBindings.get(program);
    if (existing) return existing;

    const localChunks = new Map<string, AstChunkNode>();
    for (const chunk of program.chunks) {
      localChunks.set(chunk.name, chunk);
    }

    const bindings: ProgramBindings = {
      dir: currentDir,
      localChunks,
      namedImports: new Map<string, AstChunkNode>(),
      namespaceImports: new Map<string, Map<string, AstChunkNode>>(),
    };
    programBindings.set(program, bindings);

    for (const importNode of program.imports) {
      const importedAst = loadImportedProgram(importNode, currentDir);
      const importedDir = path.resolve(
        currentDir,
        path.dirname(importNode.source),
      );
      getProgramBindings(importedAst, importedDir);
      const selectedChunks = selectImportChunks(importedAst, importNode);

      if (importNode.clause.type === "NamespaceImport") {
        const nsMap = new Map<string, AstChunkNode>();
        for (const chunk of selectedChunks) {
          nsMap.set(chunk.name, chunk);
        }
        bindings.namespaceImports.set(importNode.clause.alias, nsMap);
        continue;
      }

      for (const item of importNode.clause.items) {
        const chunk = selectedChunks.find(
          (candidate) => candidate.name === item.name,
        );
        if (!chunk) continue;
        const key = item.alias ?? item.name;
        bindings.namedImports.set(key, chunk);
      }
    }

    for (const chunk of program.chunks) {
      chunkBindings.set(chunk, bindings);
    }

    return bindings;
  }

  function collectImportChunks(
    program: AstProgramNode,
    currentDir: string,
  ): Array<{ chunk: AstChunkNode; dir: string }> {
    const importedChunks: Array<{ chunk: AstChunkNode; dir: string }> = [];
    for (const importNode of program.imports) {
      const importedAst = loadImportedProgram(importNode, currentDir);
      const importedDir = path.resolve(
        currentDir,
        path.dirname(importNode.source),
      );
      importedChunks.push(...collectImportChunks(importedAst, importedDir));
      const selectedChunks = selectImportChunks(importedAst, importNode);
      for (const chunk of selectedChunks) {
        importedChunks.push({ chunk, dir: importedDir });
      }
    }
    return importedChunks;
  }

  function registerGlobalsFromChunk(
    chunk: AstChunkNode,
    currentDir: string,
  ): void {
    for (const node of chunk.body) {
      if (!node) continue;
      if (node.type === "Env") {
        for (const decl of (node as AstEnvNode).body) {
          if (decl.type !== "Global") {
            throw new MoonChunkError(
              "Only global declarations are allowed inside env block.",
              decl.line || node.line,
              1,
            );
          }

          const globalDecl = decl as AstGlobalNode;
          if (globalSymbols.has(globalDecl.name)) {
            throw new MoonChunkError(
              `Global variable redeclaration: ${globalDecl.name}`,
              globalDecl.line,
              1,
            );
          }

          globalSymbols.set(globalDecl.name, {
            declaredType: globalDecl.declaredType ?? null,
            expr: globalDecl.expr,
            line: globalDecl.line,
            dir: currentDir,
          });
        }
      }
    }
  }

  function registerGlobalsFromProgram(
    program: AstProgramNode,
    currentDir: string,
  ): void {
    const importedChunks = collectImportChunks(program, currentDir);
    for (const imported of importedChunks) {
      registerGlobalsFromChunk(imported.chunk, imported.dir);
    }
    for (const chunk of program.chunks) {
      registerGlobalsFromChunk(chunk, currentDir);
    }
  }

  function resolveChunkPath(
    bindings: ProgramBindings,
    chunkPath: string,
    line: number,
  ): AstChunkNode {
    const parts = chunkPath.split(".");
    if (parts.length === 1) {
      const name = parts[0];
      const localChunk = bindings.localChunks.get(name);
      if (localChunk) return localChunk;

      const importedChunk = bindings.namedImports.get(name);
      if (importedChunk) return importedChunk;

      throw new MoonChunkError(`Chunk "${chunkPath}" not found.`, line, 1);
    }

    if (parts.length === 2) {
      const [namespaceAlias, chunkName] = parts;
      const namespace = bindings.namespaceImports.get(namespaceAlias);
      if (!namespace) {
        throw new MoonChunkError(
          `Unknown import namespace in @include: ${namespaceAlias}.`,
          line,
          1,
        );
      }

      const importedChunk = namespace.get(chunkName);
      if (!importedChunk) {
        throw new MoonChunkError(
          `Chunk "${chunkName}" is not available in namespace "${namespaceAlias}".`,
          line,
          1,
        );
      }
      return importedChunk;
    }

    throw new MoonChunkError(
      `Invalid chunk path "${chunkPath}". Use "ChunkName" or "Namespace.ChunkName".`,
      line,
      1,
    );
  }

  function executeChunk(
    chunk: AstChunkNode,
    parentScope: Scope,
    includeStack: Set<AstChunkNode>,
  ): void {
    if (includeStack.has(chunk)) {
      throw new MoonChunkError(
        `Circular chunk include detected for chunk: ${chunk.name}`,
        chunk.line,
        1,
      );
    }

    const bindings = chunkBindings.get(chunk);
    if (!bindings) {
      throw new MoonChunkError(
        `Internal error: missing bindings for chunk "${chunk.name}".`,
        chunk.line,
        1,
      );
    }

    const chunkScope = parentScope.derive();
    includeStack.add(chunk);
    try {
      for (const includeNode of chunk.includes) {
        const target = resolveChunkPath(
          bindings,
          includeNode.targetPath,
          includeNode.line,
        );
        executeChunk(target, parentScope, includeStack);
      }

      const chunkStatements = chunk.body as Array<AstNode | null>;
      execList(chunkStatements, chunkScope, bindings.dir);
    } finally {
      includeStack.delete(chunk);
    }
  }

  function resolveMoonEntry(
    moon: AstMoonNode,
    rootProgram: AstProgramNode,
    rootDir: string,
  ): AstChunkNode {
    const bindings = getProgramBindings(rootProgram, rootDir);
    return resolveChunkPath(bindings, moon.targetPath, moon.line);
  }

  function execNode(node: AstNode, scope: Scope, currentDir: string): void {
    if (node.type === "Output") {
      outputDir = path.resolve(cwd, node.value);
      return;
    }

    if (node.type === "Env") {
      return;
    }
    execRuntimeStatement(node as AstRuntimeNode, scope, currentDir, false);
  }

  const rootBindings = getProgramBindings(ast, cwd);

  for (const [name, chunk] of rootBindings.localChunks.entries()) {
    globalScope.set(name, toChunkObject(chunk));
  }
  for (const [name, chunk] of rootBindings.namedImports.entries()) {
    globalScope.set(name, toChunkObject(chunk));
  }
  for (const [namespaceName, namespaceChunks] of rootBindings.namespaceImports.entries()) {
    const namespaceObject: Record<string, unknown> = {};
    for (const [chunkName, chunk] of namespaceChunks.entries()) {
      namespaceObject[chunkName] = toChunkObject(chunk);
    }
    globalScope.set(namespaceName, namespaceObject);
  }

  registerGlobalsFromProgram(ast, cwd);
  for (const [name] of globalSymbols) {
    evaluateGlobal(name, 1);
  }

  const entryChunks: AstChunkNode[] =
    ast.moons.length > 0
      ? ast.moons.map((moon) => resolveMoonEntry(moon, ast, cwd))
      : [];

  for (const chunk of entryChunks) {
    executeChunk(chunk, globalScope, new Set<AstChunkNode>());
  }
  return {
    output: outputLogs,
    result: {
      chunks: ast.chunks.map((chunk: AstChunkNode) => chunk.name),
      outputDir,
    },
    generatedFiles,
  };
}
