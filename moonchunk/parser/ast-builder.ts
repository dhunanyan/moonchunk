import { Token } from "antlr4ts";
import { AbstractParseTreeVisitor } from "antlr4ts/tree/AbstractParseTreeVisitor";
import {
  ArrowFunctionDeclarationContext,
  BreakStatementContext,
  ChunkDeclContext,
  ChunkStatementContext,
  ConstStatementContext,
  ContentStatementContext,
  ContinueStatementContext,
  EnvBlockContext,
  ExpressionContext,
  ExpressionFragmentContext,
  ExpressionStatementContext,
  ForStatementContext,
  WhileStatementContext,
  FunctionBodyStatementContext,
  FunctionDeclarationContext,
  GlobalStatementContext,
  IfStatementContext,
  IncludeStatementContext,
  ImportClauseContext,
  ImportItemContext,
  ImportStatementContext,
  LetStatementContext,
  MetaStatementContext,
  MoonStatementContext,
  NamedImportClauseContext,
  NamespaceImportClauseContext,
  OutputStatementContext,
  PageInnerStatementContext,
  PageRuntimeStatementContext,
  PageStatementContext,
  ParameterContext,
  ParameterListContext,
  ProgramContext,
  ReturnStatementContext,
  RuntimeBlockContext,
  RuntimeChunkStatementContext,
  TopLevelStatementContext,
} from "../../.antlr/MoonChunkParser";
import { MoonChunkParserVisitor } from "../../.antlr/MoonChunkParserVisitor";

export class AstBuilder
  extends AbstractParseTreeVisitor<unknown>
  implements MoonChunkParserVisitor<unknown>
{
  constructor(private readonly sourceCode: string) {
    super();
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

  private sliceFromTokens(start: Token, stop: Token | undefined): string {
    const from = start.startIndex;
    const to = stop ? stop.stopIndex : from;
    return this.sourceCode.slice(from, to + 1);
  }

  private toExpr(ctx: ExpressionContext): string {
    return this.sliceFromTokens(ctx.start, ctx.stop).trim();
  }

  private toSource(ctx: { start: Token; stop?: Token }): string {
    return this.sliceFromTokens(ctx.start, ctx.stop).trim();
  }

  visitProgram(ctx: ProgramContext): unknown {
    const topLevel = ctx
      .topLevelStatement()
      .map((node) => this.visit(node)) as Array<unknown>;
    return {
      type: "Program",
      imports: ctx.importStatement().map((stmt) => this.visit(stmt)),
      moons: topLevel.filter(
        (node) => (node as { type?: string }).type === "Moon",
      ),
      chunks: topLevel.filter(
        (node) => (node as { type?: string }).type === "Chunk",
      ),
    };
  }

  visitTopLevelStatement(ctx: TopLevelStatementContext): unknown {
    if (ctx.chunkDecl()) return this.visit(ctx.chunkDecl()!);
    if (ctx.moonStatement()) return this.visit(ctx.moonStatement()!);
    return null;
  }

  visitExpressionFragment(ctx: ExpressionFragmentContext): unknown {
    return this.toExpr(ctx.expression());
  }

  visitChunkDecl(ctx: ChunkDeclContext): unknown {
    return {
      type: "Chunk",
      name: this.unquote(ctx.chunkNameLiteral().text),
      exported: Boolean(ctx.EXPORT()),
      includes: ctx
        .includeStatement()
        .map((includeStmt) => this.visit(includeStmt)),
      body: ctx.chunkStatement().map((stmt) => this.visit(stmt)),
      line: ctx.start.line,
    };
  }

  visitIncludeStatement(ctx: IncludeStatementContext): unknown {
    return {
      type: "Include",
      targetPath: this.toSource(ctx.identifierPath()),
      line: ctx.start.line,
    };
  }

  visitMoonStatement(ctx: MoonStatementContext): unknown {
    return {
      type: "Moon",
      targetPath: this.toSource(ctx.identifierPath()),
      line: ctx.start.line,
    };
  }

  visitChunkStatement(ctx: ChunkStatementContext): unknown {
    if (ctx.outputStatement()) return this.visit(ctx.outputStatement()!);
    if (ctx.envBlock()) return this.visit(ctx.envBlock()!);
    if (ctx.runtimeChunkStatement())
      return this.visit(ctx.runtimeChunkStatement()!);
    return null;
  }

  visitRuntimeChunkStatement(ctx: RuntimeChunkStatementContext): unknown {
    if (ctx.functionDeclaration())
      return this.visit(ctx.functionDeclaration()!);
    if (ctx.arrowFunctionDeclaration())
      return this.visit(ctx.arrowFunctionDeclaration()!);
    if (ctx.metaStatement()) return this.visit(ctx.metaStatement()!);
    if (ctx.constStatement()) return this.visit(ctx.constStatement()!);
    if (ctx.letStatement()) return this.visit(ctx.letStatement()!);
    if (ctx.contentStatement()) return this.visit(ctx.contentStatement()!);
    if (ctx.pageStatement()) return this.visit(ctx.pageStatement()!);
    if (ctx.forStatement()) return this.visit(ctx.forStatement()!);
    if (ctx.whileStatement()) return this.visit(ctx.whileStatement()!);
    if (ctx.ifStatement()) return this.visit(ctx.ifStatement()!);
    if (ctx.breakStatement()) return this.visit(ctx.breakStatement()!);
    if (ctx.continueStatement()) return this.visit(ctx.continueStatement()!);
    if (ctx.returnStatement()) return this.visit(ctx.returnStatement()!);
    if (ctx.expressionStatement())
      return this.visit(ctx.expressionStatement()!);
    return null;
  }

  visitImportStatement(ctx: ImportStatementContext): unknown {
    return {
      type: "Import",
      clause: this.visit(ctx.importClause()),
      source: this.unquote(ctx.STRING().text),
      line: ctx.start.line,
    };
  }

  visitImportClause(ctx: ImportClauseContext): unknown {
    if (ctx.namedImportClause()) return this.visit(ctx.namedImportClause()!);
    if (ctx.namespaceImportClause())
      return this.visit(ctx.namespaceImportClause()!);
    return null;
  }

  visitNamedImportClause(ctx: NamedImportClauseContext): unknown {
    return {
      type: "NamedImport",
      items: ctx.importItem().map((item) => this.visit(item)),
    };
  }

  visitImportItem(ctx: ImportItemContext): unknown {
    const ids = ctx.identifierAtom();
    const name = ids[0].text;
    const alias = ids.length > 1 ? ids[1].text : null;
    return { name, alias };
  }

  visitNamespaceImportClause(ctx: NamespaceImportClauseContext): unknown {
    return {
      type: "NamespaceImport",
      alias: ctx.identifierAtom().text,
    };
  }

  visitOutputStatement(ctx: OutputStatementContext): unknown {
    return {
      type: "Output",
      value: this.unquote(ctx.STRING().text),
      line: ctx.start.line,
    };
  }

  visitEnvBlock(ctx: EnvBlockContext): unknown {
    return {
      type: "Env",
      body: ctx.globalStatement().map((g) => this.visit(g)),
      line: ctx.start.line,
    };
  }

  visitGlobalStatement(ctx: GlobalStatementContext): unknown {
    return {
      type: "Global",
      name: ctx.identifierAtom().text,
      declaredType: ctx.typeName() ? ctx.typeName()!.text : null,
      expr: this.toExpr(ctx.expression()),
      line: ctx.start.line,
    };
  }

  visitLetStatement(ctx: LetStatementContext): unknown {
    return {
      type: "Let",
      name: ctx.identifierAtom().text,
      declaredType: ctx.typeName() ? ctx.typeName()!.text : null,
      expr: this.toExpr(ctx.expression()),
      line: ctx.start.line,
    };
  }

  visitConstStatement(ctx: ConstStatementContext): unknown {
    return {
      type: "Const",
      name: ctx.identifierAtom().text,
      declaredType: ctx.typeName() ? ctx.typeName()!.text : null,
      expr: this.toExpr(ctx.expression()),
      line: ctx.start.line,
    };
  }

  visitMetaStatement(ctx: MetaStatementContext): unknown {
    return {
      type: "Meta",
      name: ctx.metaKey().text,
      expr: this.toExpr(ctx.expression()),
      line: ctx.start.line,
    };
  }

  visitExpressionStatement(ctx: ExpressionStatementContext): unknown {
    return {
      type: "ExpressionStatement",
      expr: this.toExpr(ctx.expression()),
      line: ctx.start.line,
    };
  }

  visitFunctionDeclaration(ctx: FunctionDeclarationContext): unknown {
    return {
      type: "FunctionDeclaration",
      name: ctx.identifierAtom().text,
      params: ctx.parameterList() ? this.visit(ctx.parameterList()!) : [],
      returnType: ctx.returnTypeName() ? ctx.returnTypeName()!.text : null,
      body: ctx.functionBodyStatement().map((stmt) => this.visit(stmt)),
      line: ctx.start.line,
    };
  }

  visitArrowFunctionDeclaration(ctx: ArrowFunctionDeclarationContext): unknown {
    return {
      type: "ArrowFunctionDeclaration",
      name: ctx.identifierAtom().text,
      params: ctx.parameterList() ? this.visit(ctx.parameterList()!) : [],
      returnType: ctx.returnTypeName() ? ctx.returnTypeName()!.text : null,
      bodyExpr: this.toSource(ctx.arrowFunctionBody()),
      line: ctx.start.line,
    };
  }

  visitParameterList(ctx: ParameterListContext): unknown {
    return ctx.parameter().map((p) => this.visit(p));
  }

  visitParameter(ctx: ParameterContext): unknown {
    return {
      name: ctx.identifierAtom().text,
      declaredType: ctx.typeName() ? ctx.typeName()!.text : null,
    };
  }

  visitFunctionBodyStatement(ctx: FunctionBodyStatementContext): unknown {
    if (ctx.constStatement()) return this.visit(ctx.constStatement()!);
    if (ctx.functionDeclaration())
      return this.visit(ctx.functionDeclaration()!);
    if (ctx.arrowFunctionDeclaration())
      return this.visit(ctx.arrowFunctionDeclaration()!);
    if (ctx.letStatement()) return this.visit(ctx.letStatement()!);
    if (ctx.ifStatement()) return this.visit(ctx.ifStatement()!);
    if (ctx.forStatement()) return this.visit(ctx.forStatement()!);
    if (ctx.whileStatement()) return this.visit(ctx.whileStatement()!);
    if (ctx.breakStatement()) return this.visit(ctx.breakStatement()!);
    if (ctx.continueStatement()) return this.visit(ctx.continueStatement()!);
    if (ctx.returnStatement()) return this.visit(ctx.returnStatement()!);
    if (ctx.expressionStatement())
      return this.visit(ctx.expressionStatement()!);
    return null;
  }

  visitReturnStatement(ctx: ReturnStatementContext): unknown {
    const expr = ctx.expression() ? this.toExpr(ctx.expression()!) : null;
    return {
      type: "Return",
      expr,
      line: ctx.start.line,
    };
  }

  private mapRuntimeBlock(ctx: RuntimeBlockContext): Array<unknown> {
    return ctx.runtimeChunkStatement().map((stmt) => this.visit(stmt));
  }

  visitBreakStatement(ctx: BreakStatementContext): unknown {
    return {
      type: "Break",
      line: ctx.start.line,
    };
  }

  visitContinueStatement(ctx: ContinueStatementContext): unknown {
    return {
      type: "Continue",
      line: ctx.start.line,
    };
  }

  visitPageStatement(ctx: PageStatementContext): unknown {
    const routeLiteral = ctx.STRING();
    return {
      type: "Page",
      route: this.unquote(routeLiteral.text),
      body: ctx.pageInnerStatement().map((item) => this.visit(item)),
      line: ctx.start.line,
    };
  }

  visitPageInnerStatement(ctx: PageInnerStatementContext): unknown {
    if (ctx.pageRuntimeStatement()) return this.visit(ctx.pageRuntimeStatement()!);
    return null;
  }

  visitPageRuntimeStatement(ctx: PageRuntimeStatementContext): unknown {
    if (ctx.functionDeclaration())
      return this.visit(ctx.functionDeclaration()!);
    if (ctx.arrowFunctionDeclaration())
      return this.visit(ctx.arrowFunctionDeclaration()!);
    if (ctx.metaStatement()) return this.visit(ctx.metaStatement()!);
    if (ctx.constStatement()) return this.visit(ctx.constStatement()!);
    if (ctx.letStatement()) return this.visit(ctx.letStatement()!);
    if (ctx.contentStatement()) return this.visit(ctx.contentStatement()!);
    if (ctx.forStatement()) return this.visit(ctx.forStatement()!);
    if (ctx.whileStatement()) return this.visit(ctx.whileStatement()!);
    if (ctx.ifStatement()) return this.visit(ctx.ifStatement()!);
    if (ctx.breakStatement()) return this.visit(ctx.breakStatement()!);
    if (ctx.continueStatement()) return this.visit(ctx.continueStatement()!);
    if (ctx.expressionStatement())
      return this.visit(ctx.expressionStatement()!);
    return null;
  }

  visitContentStatement(ctx: ContentStatementContext): unknown {
    const open = ctx.CONTENT_START().symbol;
    const close = ctx.CONTENT_END().symbol;

    let inner = "";
    if (open && close) {
      const from = open.stopIndex + 1;
      const to = close.startIndex;
      inner = to > from ? this.sourceCode.slice(from, to) : "";
    }

    inner = inner.replace(/^\s*\r?\n/, "").replace(/\r?\n\s*$/, "");

    return {
      type: "Content",
      template: inner,
      line: ctx.start.line,
    };
  }

  visitForStatement(ctx: ForStatementContext): unknown {
    const init = ctx.forInit();
    const initName = init.identifierAtom().text;
    const typeCtxRaw = (
      init as unknown as { typeName?: () => unknown }
    ).typeName?.();
    let initDeclaredType: string | null = null;
    if (Array.isArray(typeCtxRaw)) {
      initDeclaredType =
        typeCtxRaw.length > 0 ? (typeCtxRaw[0] as { text: string }).text : null;
    } else if (
      typeCtxRaw &&
      typeof typeCtxRaw === "object" &&
      "text" in typeCtxRaw
    ) {
      initDeclaredType = (typeCtxRaw as { text: string }).text;
    }

    const updateExpr = this.toExpr(ctx.forUpdate().expression());
    const body = this.mapRuntimeBlock(ctx.runtimeBlock());
    return {
      type: "For",
      initName,
      initDeclaredType,
      initExpr: this.toExpr(init.expression()),
      conditionExpr: this.toExpr(ctx.expression()),
      updateExpr,
      body,
      line: ctx.start.line,
    };
  }

  visitWhileStatement(ctx: WhileStatementContext): unknown {
    return {
      type: "While",
      condition: this.toExpr(ctx.expression()),
      body: this.mapRuntimeBlock(ctx.runtimeBlock()),
      line: ctx.start.line,
    };
  }

  visitIfStatement(ctx: IfStatementContext): unknown {
    const blocks = ctx.runtimeBlock();
    const thenBlock = Array.isArray(blocks) ? blocks[0] : blocks;
    const elseBlock = Array.isArray(blocks) ? blocks[1] : undefined;
    return {
      type: "If",
      condition: this.toExpr(ctx.expression()),
      body: this.mapRuntimeBlock(thenBlock),
      elseBody: elseBlock ? this.mapRuntimeBlock(elseBlock) : null,
      line: ctx.start.line,
    };
  }
}
