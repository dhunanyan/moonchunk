import { CommonTokenStream } from 'antlr4ts';
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';
import {
  ContentStatementContext,
  EnvBlockContext,
  ExpressionContext,
  ForStatementContext,
  GlobalStatementContext,
  IfStatementContext,
  ImportStatementContext,
  LetStatementContext,
  MoonChunkParser,
  OutputStatementContext,
  PageInnerStatementContext,
  PageStatementContext,
  ProgramContext,
  RuntimeSiteStatementContext,
  SiteDeclContext,
  SiteStatementContext
} from '../../.antlr/MoonChunkParser';
import { MoonChunkVisitor } from '../../.antlr/MoonChunkVisitor';

export class AstBuilder extends AbstractParseTreeVisitor<unknown> implements MoonChunkVisitor<unknown> {
  private sourceCode: string;

  constructor(_tokens: CommonTokenStream, sourceCode: string) {
    super();
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
    if (ctx.envBlock()) return this.visit(ctx.envBlock()!);
    if (ctx.runtimeSiteStatement()) return this.visit(ctx.runtimeSiteStatement()!);
    return null;
  }

  visitRuntimeSiteStatement(ctx: RuntimeSiteStatementContext): unknown {
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

  visitEnvBlock(ctx: EnvBlockContext): unknown {
    return {
      type: 'Env',
      body: ctx.globalStatement().map((g) => this.visit(g)),
      line: ctx.start.line
    };
  }

  visitGlobalStatement(ctx: GlobalStatementContext): unknown {
    const declaredType = ctx.typeName() ? ctx.typeName()!.text : null;
    return {
      type: 'Global',
      name: ctx.IDENTIFIER().text,
      declaredType,
      expr: this.toExpr(ctx.expression()),
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
    const body = ctx.runtimeSiteStatement().map((stmt) => this.visit(stmt));
    return {
      type: 'For',
      item: ctx.IDENTIFIER().text,
      sourceExpr: this.toExpr(ctx.expression()),
      body,
      line: ctx.start.line
    };
  }

  visitIfStatement(ctx: IfStatementContext): unknown {
    const body = ctx.runtimeSiteStatement().map((stmt) => this.visit(stmt));
    return {
      type: 'If',
      condition: this.toExpr(ctx.expression()),
      body,
      line: ctx.start.line
    };
  }
}
