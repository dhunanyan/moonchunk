import { Token } from 'antlr4ts';
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';
import {
  ArrowFunctionDeclarationContext,
  ChunkDeclContext,
  ChunkStatementContext,
  ConstStatementContext,
  ContentStatementContext,
  EnvBlockContext,
  ExpressionContext,
  ExpressionFragmentContext,
  ExpressionStatementContext,
  ForStatementContext,
  FunctionBodyStatementContext,
  FunctionDeclarationContext,
  GlobalStatementContext,
  IfStatementContext,
  ImportClauseContext,
  ImportItemContext,
  ImportStatementContext,
  LetStatementContext,
  MoonChunkParser,
  NamedImportClauseContext,
  NamespaceImportClauseContext,
  OutputStatementContext,
  PageInnerStatementContext,
  PageStatementContext,
  ParameterContext,
  ParameterListContext,
  ProgramContext,
  ReturnStatementContext,
  RuntimeChunkStatementContext
} from '../../.antlr/MoonChunkParser';
import { MoonChunkParserVisitor } from '../../.antlr/MoonChunkParserVisitor';

export class AstBuilder extends AbstractParseTreeVisitor<unknown> implements MoonChunkParserVisitor<unknown> {
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
    return {
      type: 'Program',
      chunks: ctx.chunkDecl().map((decl) => this.visit(decl))
    };
  }

  visitExpressionFragment(ctx: ExpressionFragmentContext): unknown {
    return this.toExpr(ctx.expression());
  }

  visitChunkDecl(ctx: ChunkDeclContext): unknown {
    return {
      type: 'Chunk',
      name: this.unquote(ctx.chunkNameLiteral().text),
      body: ctx.chunkStatement().map((stmt) => this.visit(stmt)),
      line: ctx.start.line
    };
  }

  visitChunkStatement(ctx: ChunkStatementContext): unknown {
    if (ctx.importStatement()) return this.visit(ctx.importStatement()!);
    if (ctx.outputStatement()) return this.visit(ctx.outputStatement()!);
    if (ctx.envBlock()) return this.visit(ctx.envBlock()!);
    if (ctx.runtimeChunkStatement()) return this.visit(ctx.runtimeChunkStatement()!);
    return null;
  }

  visitRuntimeChunkStatement(ctx: RuntimeChunkStatementContext): unknown {
    if (ctx.functionDeclaration()) return this.visit(ctx.functionDeclaration()!);
    if (ctx.arrowFunctionDeclaration()) return this.visit(ctx.arrowFunctionDeclaration()!);
    if (ctx.constStatement()) return this.visit(ctx.constStatement()!);
    if (ctx.letStatement()) return this.visit(ctx.letStatement()!);
    if (ctx.pageStatement()) return this.visit(ctx.pageStatement()!);
    if (ctx.forStatement()) return this.visit(ctx.forStatement()!);
    if (ctx.ifStatement()) return this.visit(ctx.ifStatement()!);
    return null;
  }

  visitImportStatement(ctx: ImportStatementContext): unknown {
    return {
      type: 'Import',
      clause: this.visit(ctx.importClause()),
      source: this.unquote(ctx.STRING().text),
      line: ctx.start.line
    };
  }

  visitImportClause(ctx: ImportClauseContext): unknown {
    if (ctx.namedImportClause()) return this.visit(ctx.namedImportClause()!);
    if (ctx.namespaceImportClause()) return this.visit(ctx.namespaceImportClause()!);
    return null;
  }

  visitNamedImportClause(ctx: NamedImportClauseContext): unknown {
    return {
      type: 'NamedImport',
      items: ctx.importItem().map((item) => this.visit(item))
    };
  }

  visitImportItem(ctx: ImportItemContext): unknown {
    const ids = ctx.IDENTIFIER();
    const name = ids[0].text;
    const alias = ids.length > 1 ? ids[1].text : null;
    return { name, alias };
  }

  visitNamespaceImportClause(ctx: NamespaceImportClauseContext): unknown {
    return {
      type: 'NamespaceImport',
      alias: ctx.IDENTIFIER().text
    };
  }

  visitOutputStatement(ctx: OutputStatementContext): unknown {
    return {
      type: 'Output',
      value: this.unquote(ctx.STRING().text),
      line: ctx.start.line
    };
  }

  visitEnvBlock(ctx: EnvBlockContext): unknown {
    return {
      type: 'Env',
      body: ctx.globalStatement().map((g) => this.visit(g)),
      line: ctx.start.line
    };
  }

  visitGlobalStatement(ctx: GlobalStatementContext): unknown {
    return {
      type: 'Global',
      name: ctx.IDENTIFIER().text,
      declaredType: ctx.typeName() ? ctx.typeName()!.text : null,
      expr: this.toExpr(ctx.expression()),
      line: ctx.start.line
    };
  }

  visitLetStatement(ctx: LetStatementContext): unknown {
    return {
      type: 'Let',
      name: ctx.IDENTIFIER().text,
      declaredType: ctx.typeName() ? ctx.typeName()!.text : null,
      expr: this.toExpr(ctx.expression()),
      line: ctx.start.line
    };
  }

  visitConstStatement(ctx: ConstStatementContext): unknown {
    return {
      type: 'Const',
      name: ctx.IDENTIFIER().text,
      declaredType: ctx.typeName() ? ctx.typeName()!.text : null,
      expr: this.toExpr(ctx.expression()),
      line: ctx.start.line
    };
  }

  visitExpressionStatement(ctx: ExpressionStatementContext): unknown {
    return {
      type: 'ExpressionStatement',
      expr: this.toExpr(ctx.expression()),
      line: ctx.start.line
    };
  }

  visitFunctionDeclaration(ctx: FunctionDeclarationContext): unknown {
    return {
      type: 'FunctionDeclaration',
      name: ctx.IDENTIFIER().text,
      params: ctx.parameterList() ? this.visit(ctx.parameterList()!) : [],
      returnType: ctx.typeName() ? ctx.typeName()!.text : null,
      body: ctx.functionBodyStatement().map((stmt) => this.visit(stmt)),
      line: ctx.start.line
    };
  }

  visitArrowFunctionDeclaration(ctx: ArrowFunctionDeclarationContext): unknown {
    return {
      type: 'ArrowFunctionDeclaration',
      name: ctx.IDENTIFIER().text,
      params: ctx.parameterList() ? this.visit(ctx.parameterList()!) : [],
      returnType: ctx.typeName() ? ctx.typeName()!.text : null,
      bodyExpr: this.toSource(ctx.arrowFunctionBody()),
      line: ctx.start.line
    };
  }

  visitParameterList(ctx: ParameterListContext): unknown {
    return ctx.parameter().map((p) => this.visit(p));
  }

  visitParameter(ctx: ParameterContext): unknown {
    return {
      name: ctx.IDENTIFIER().text,
      declaredType: ctx.typeName() ? ctx.typeName()!.text : null
    };
  }

  visitFunctionBodyStatement(ctx: FunctionBodyStatementContext): unknown {
    if (ctx.constStatement()) return this.visit(ctx.constStatement()!);
    if (ctx.arrowFunctionDeclaration()) return this.visit(ctx.arrowFunctionDeclaration()!);
    if (ctx.letStatement()) return this.visit(ctx.letStatement()!);
    if (ctx.ifStatement()) return this.visit(ctx.ifStatement()!);
    if (ctx.forStatement()) return this.visit(ctx.forStatement()!);
    if (ctx.returnStatement()) return this.visit(ctx.returnStatement()!);
    if (ctx.expressionStatement()) return this.visit(ctx.expressionStatement()!);
    return null;
  }

  visitReturnStatement(ctx: ReturnStatementContext): unknown {
    return {
      type: 'Return',
      expr: this.toExpr(ctx.expression()),
      line: ctx.start.line
    };
  }

  visitPageStatement(ctx: PageStatementContext): unknown {
    const strings = ctx.STRING();
    return {
      type: 'Page',
      route: this.unquote(strings[0].text),
      layout: this.unquote(strings[1].text),
      body: ctx.pageInnerStatement().map((item) => this.visit(item)),
      line: ctx.start.line
    };
  }

  visitPageInnerStatement(ctx: PageInnerStatementContext): unknown {
    if (ctx.letStatement()) return this.visit(ctx.letStatement()!);
    if (ctx.constStatement()) return this.visit(ctx.constStatement()!);
    if (ctx.contentStatement()) return this.visit(ctx.contentStatement()!);
    return null;
  }

  visitContentStatement(ctx: ContentStatementContext): unknown {
    const open = ctx.CONTENT_START().symbol;
    const close = ctx.CONTENT_END().symbol;

    let inner = '';
    if (open && close) {
      const from = open.stopIndex + 1;
      const to = close.startIndex;
      inner = to > from ? this.sourceCode.slice(from, to) : '';
    }

    inner = inner.replace(/^\s*\r?\n/, '').replace(/\r?\n\s*$/, '');

    return {
      type: 'Content',
      template: inner,
      line: ctx.start.line
    };
  }

  visitForStatement(ctx: ForStatementContext): unknown {
    return {
      type: 'For',
      item: ctx.IDENTIFIER().text,
      sourceExpr: this.toExpr(ctx.expression()),
      body: ctx.runtimeChunkStatement().map((stmt) => this.visit(stmt)),
      line: ctx.start.line
    };
  }

  visitIfStatement(ctx: IfStatementContext): unknown {
    return {
      type: 'If',
      condition: this.toExpr(ctx.expression()),
      body: ctx.runtimeChunkStatement().map((stmt) => this.visit(stmt)),
      line: ctx.start.line
    };
  }
}
