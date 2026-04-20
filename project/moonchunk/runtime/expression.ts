import * as fs from "node:fs";
import * as path from "node:path";
import { CharStreams, CommonTokenStream } from "antlr4ts";
import { TerminalNode } from "antlr4ts/tree/TerminalNode";
import { MoonChunkLexer } from "../../.antlr/MoonChunkLexer";
import {
  AdditiveExprContext,
  AndExprContext,
  ArgumentListContext,
  ArrowFunctionBodyContext,
  ArrowFunctionDeclarationContext,
  ArrowFunctionExprContext,
  AssignmentContext,
  CallExprContext,
  CallablePrimaryContext,
  ComparisonExprContext,
  ConditionalExprContext,
  ConstStatementContext,
  EqualityExprContext,
  ExpressionContext,
  ExpressionFragmentContext,
  ExpressionStatementContext,
  ForStatementContext,
  WhileStatementContext,
  FunctionBodyStatementContext,
  FunctionDeclarationContext,
  FunctionExprContext,
  IdentifierPathContext,
  IfStatementContext,
  LetStatementContext,
  MoonChunkParser,
  MultiplicativeExprContext,
  NonCallablePrimaryContext,
  OrExprContext,
  ParameterContext,
  ParameterListContext,
  ReturnStatementContext,
  RuntimeChunkStatementContext,
  UnaryExprContext,
} from "../../.antlr/MoonChunkParser";
import { MoonChunkError } from "../errors";
import { SyntaxCollector } from "../parser/syntax-collector";
import { RuntimeHelpers } from "../types";
import { resolvePathValue } from "./path";
import { Scope } from "./scope";
import {
  coerceToNumeric,
  inferType,
  isAssignable,
  isNumericValue,
  makeNumeric,
  normalizeJsonNumbers,
  promoteNumericType,
  stringifyValue,
} from "./values";

const NO_HELPERS: RuntimeHelpers = { getGlobal: () => undefined };

type RuntimeParameter = { name: string; declaredType: string | null };

type RuntimeCallable = {
  __kind: "moonchunk_callable";
  name?: string;
  params: RuntimeParameter[];
  returnType: string | null;
  invoke: (args: unknown[], line: number) => unknown;
};

class ReturnSignal {
  constructor(public readonly value: unknown) {}
}

class BreakSignal {}
class ContinueSignal {}

function makeCallable(
  params: RuntimeParameter[],
  returnType: string | null,
  invoke: (args: unknown[], line: number) => unknown,
  name?: string,
): RuntimeCallable {
  return {
    __kind: "moonchunk_callable",
    name,
    params,
    returnType,
    invoke,
  };
}

function isCallable(value: unknown): value is RuntimeCallable {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __kind?: string }).__kind === "moonchunk_callable"
  );
}

function parseQuotedString(text: string): string {
  try {
    return JSON.parse(text);
  } catch {
    if (text.startsWith('"') && text.endsWith('"')) return text.slice(1, -1);
    return text;
  }
}

function parseNumberLiteral(text: string): unknown {
  if (/[fF]$/.test(text))
    return makeNumeric(Number(text.slice(0, -1)), "float");
  if (/[dD]$/.test(text))
    return makeNumeric(Number(text.slice(0, -1)), "double");
  if (text.includes(".")) return makeNumeric(Number(text), "double");
  return makeNumeric(Number(text), "int");
}

function getTerminalNodes(
  nodes: TerminalNode[] | TerminalNode,
): TerminalNode[] {
  return Array.isArray(nodes) ? nodes : [nodes];
}

function paramsFromList(
  parameterList?: ParameterListContext,
): RuntimeParameter[] {
  if (!parameterList) return [];
  return parameterList.parameter().map((param: ParameterContext) => ({
    name: param.IDENTIFIER().text,
    declaredType: param.typeName() ? param.typeName()!.text : null,
  }));
}

class ExprEvaluator {
  constructor(
    private readonly scope: Scope,
    private readonly cwd: string,
    private readonly line: number,
    private readonly helpers: RuntimeHelpers,
  ) {}

  evaluateFragment(ctx: ExpressionFragmentContext): unknown {
    return this.evaluateExpression(ctx.expression());
  }

  evaluateExpression(ctx: ExpressionContext): unknown {
    return this.evaluateAssignment(ctx.assignment());
  }

  private evaluateAssignment(ctx: AssignmentContext): unknown {
    if (ctx.ASSIGN()) {
      const target = ctx.identifierPath();
      const value = this.evaluateAssignment(ctx.assignment()!);
      if (!target)
        throw new MoonChunkError("Invalid assignment target.", this.line, 1);
      this.assignIdentifierPath(target, value);
      return value;
    }
    return this.evaluateConditional(ctx.conditionalExpr()!);
  }

  private evaluateConditional(ctx: ConditionalExprContext): unknown {
    const cond = this.evaluateOr(ctx.orExpr());
    if (!ctx.QUESTION()) return cond;
    if (!ctx.expression() || !ctx.conditionalExpr()) {
      throw new MoonChunkError("Invalid ternary expression.", this.line, 1);
    }
    return Boolean(cond)
      ? this.evaluateExpression(ctx.expression()!)
      : this.evaluateConditional(ctx.conditionalExpr()!);
  }

  private evaluateOr(ctx: OrExprContext): unknown {
    const parts = ctx.andExpr();
    let current = this.evaluateAnd(parts[0]);
    for (let i = 1; i < parts.length; i += 1) {
      const right = this.evaluateAnd(parts[i]);
      if (typeof current !== "boolean" || typeof right !== "boolean") {
        throw new MoonChunkError("or expects bool operands.", this.line, 1);
      }
      current = current || right;
    }
    return current;
  }

  private evaluateAnd(ctx: AndExprContext): unknown {
    const parts = ctx.equalityExpr();
    let current = this.evaluateEquality(parts[0]);
    for (let i = 1; i < parts.length; i += 1) {
      const right = this.evaluateEquality(parts[i]);
      if (typeof current !== "boolean" || typeof right !== "boolean") {
        throw new MoonChunkError("and expects bool operands.", this.line, 1);
      }
      current = current && right;
    }
    return current;
  }

  private evaluateEquality(ctx: EqualityExprContext): unknown {
    const parts = ctx.comparisonExpr();
    const ops = getTerminalNodes(ctx.EQ())
      .map(() => "==")
      .concat(getTerminalNodes(ctx.NEQ()).map(() => "!="));
    if (parts.length === 1) return this.evaluateComparison(parts[0]);

    const orderedOps: string[] = [];
    for (let i = 1; i < ctx.childCount; i += 1) {
      const text = ctx.getChild(i).text;
      if (text === "==" || text === "!=") orderedOps.push(text);
    }

    let current = this.evaluateComparison(parts[0]);
    for (let i = 1; i < parts.length; i += 1) {
      const op = orderedOps[i - 1] || ops[i - 1];
      const right = this.evaluateComparison(parts[i]);
      let eq = false;
      if (
        (isNumericValue(current) || typeof current === "number") &&
        (isNumericValue(right) || typeof right === "number")
      ) {
        const a = coerceToNumeric(current, this.line);
        const b = coerceToNumeric(right, this.line);
        eq = a.value === b.value;
      } else {
        eq = current === right;
      }
      current = op === "==" ? eq : !eq;
    }
    return current;
  }

  private evaluateComparison(ctx: ComparisonExprContext): unknown {
    const parts = ctx.additiveExpr();
    if (parts.length === 1) return this.evaluateAdditive(parts[0]);

    const ops: string[] = [];
    for (let i = 1; i < ctx.childCount; i += 1) {
      const text = ctx.getChild(i).text;
      if (text === "<" || text === ">" || text === "<=" || text === ">=")
        ops.push(text);
    }

    let current = this.evaluateAdditive(parts[0]);
    for (let i = 1; i < parts.length; i += 1) {
      const op = ops[i - 1];
      const a = coerceToNumeric(current, this.line);
      const b = coerceToNumeric(this.evaluateAdditive(parts[i]), this.line);
      if (op === "<") current = a.value < b.value;
      if (op === ">") current = a.value > b.value;
      if (op === "<=") current = a.value <= b.value;
      if (op === ">=") current = a.value >= b.value;
    }
    return current;
  }

  private evaluateAdditive(ctx: AdditiveExprContext): unknown {
    const parts = ctx.multiplicativeExpr();
    if (parts.length === 1) return this.evaluateMultiplicative(parts[0]);

    const ops: string[] = [];
    for (let i = 1; i < ctx.childCount; i += 1) {
      const text = ctx.getChild(i).text;
      if (text === "+" || text === "-") ops.push(text);
    }

    let current = this.evaluateMultiplicative(parts[0]);
    for (let i = 1; i < parts.length; i += 1) {
      const op = ops[i - 1];
      const right = this.evaluateMultiplicative(parts[i]);
      if (op === "+") {
        if (typeof current === "string" || typeof right === "string") {
          current = `${stringifyValue(current)}${stringifyValue(right)}`;
        } else if (
          (isNumericValue(current) || typeof current === "number") &&
          (isNumericValue(right) || typeof right === "number")
        ) {
          const a = coerceToNumeric(current, this.line);
          const b = coerceToNumeric(right, this.line);
          current = makeNumeric(
            a.value + b.value,
            promoteNumericType(a.numType, b.numType),
          );
        } else {
          current = `${stringifyValue(current)}${stringifyValue(right)}`;
        }
      } else {
        const a = coerceToNumeric(current, this.line);
        const b = coerceToNumeric(right, this.line);
        current = makeNumeric(
          a.value - b.value,
          promoteNumericType(a.numType, b.numType),
        );
      }
    }
    return current;
  }

  private evaluateMultiplicative(ctx: MultiplicativeExprContext): unknown {
    const parts = ctx.unaryExpr();
    if (parts.length === 1) return this.evaluateUnary(parts[0]);

    const ops: string[] = [];
    for (let i = 1; i < ctx.childCount; i += 1) {
      const text = ctx.getChild(i).text;
      if (text === "*" || text === "/" || text === "%") ops.push(text);
    }

    let current = this.evaluateUnary(parts[0]);
    for (let i = 1; i < parts.length; i += 1) {
      const op = ops[i - 1];
      const a = coerceToNumeric(current, this.line);
      const b = coerceToNumeric(this.evaluateUnary(parts[i]), this.line);
      if (op === "*") {
        current = makeNumeric(
          a.value * b.value,
          promoteNumericType(a.numType, b.numType),
        );
      } else if (op === "/") {
        if (a.numType === "int" && b.numType === "int") {
          current = makeNumeric(Math.trunc(a.value / b.value), "int");
        } else {
          current = makeNumeric(
            a.value / b.value,
            promoteNumericType(a.numType, b.numType),
          );
        }
      } else {
        if (a.numType === "int" && b.numType === "int") {
          current = makeNumeric(a.value % b.value, "int");
        } else {
          current = makeNumeric(
            a.value % b.value,
            promoteNumericType(a.numType, b.numType),
          );
        }
      }
    }
    return current;
  }

  private evaluateUnary(ctx: UnaryExprContext): unknown {
    if (ctx.NOT()) {
      const value = this.evaluateUnary(ctx.unaryExpr()!);
      if (typeof value !== "boolean") {
        throw new MoonChunkError(
          `Operator not expects bool, got ${inferType(value)}.`,
          this.line,
          1,
        );
      }
      return !value;
    }
    if (ctx.MINUS()) {
      const numeric = coerceToNumeric(
        this.evaluateUnary(ctx.unaryExpr()!),
        this.line,
      );
      return makeNumeric(-numeric.value, numeric.numType);
    }
    return this.evaluateCallExpr(ctx.callExpr()!);
  }

  private evaluateCallExpr(ctx: CallExprContext): unknown {
    if (ctx.nonCallablePrimary()) {
      return this.evaluateNonCallablePrimary(ctx.nonCallablePrimary()!);
    }

    let current = this.evaluateCallablePrimary(ctx.callablePrimary()!);
    const leftParens = getTerminalNodes(ctx.LPAREN());
    const rightParens = getTerminalNodes(ctx.RPAREN());
    const argumentLists = ctx.argumentList();

    let argIndex = 0;
    for (let i = 0; i < leftParens.length; i += 1) {
      const l = leftParens[i].symbol.startIndex;
      const r = rightParens[i].symbol.stopIndex;
      let args: unknown[] = [];
      if (argIndex < argumentLists.length) {
        const candidate = argumentLists[argIndex];
        if (
          candidate.start.startIndex > l &&
          candidate.stop &&
          candidate.stop.stopIndex < r
        ) {
          args = candidate
            .expression()
            .map((exp) => this.evaluateExpression(exp));
          argIndex += 1;
        }
      }
      current = this.applyCall(current, args);
    }

    return current;
  }

  private evaluateCallablePrimary(ctx: CallablePrimaryContext): unknown {
    if (ctx.arrowFunctionExpr())
      return this.createArrowFunction(ctx.arrowFunctionExpr()!);
    if (ctx.functionExpr())
      return this.createFunctionExpression(ctx.functionExpr()!);
    if (ctx.identifierPath())
      return this.resolveIdentifierPath(ctx.identifierPath()!);
    throw new MoonChunkError("Invalid callable primary.", this.line, 1);
  }

  private evaluateNonCallablePrimary(ctx: NonCallablePrimaryContext): unknown {
    if (ctx.STRING()) return parseQuotedString(ctx.STRING()!.text);
    if (ctx.NUMBER()) return parseNumberLiteral(ctx.NUMBER()!.text);
    if (ctx.TRUE()) return true;
    if (ctx.FALSE()) return false;
    if (ctx.expression()) return this.evaluateExpression(ctx.expression()!);
    throw new MoonChunkError("Unsupported expression primary.", this.line, 1);
  }

  private createFunctionExpression(ctx: FunctionExprContext): RuntimeCallable {
    const params = paramsFromList(ctx.parameterList());
    const returnType = ctx.typeName() ? ctx.typeName()!.text : null;
    const bodyStatements = ctx.functionBodyStatement();
    const closure = this.scope;

    return makeCallable(
      params,
      returnType,
      (args: unknown[], callLine: number) => {
        const fnScope = closure.derive();
        this.bindParams(fnScope, params, args, callLine);
        const result = this.runFunctionBodyStatements(
          bodyStatements,
          fnScope,
          callLine,
        );
        this.ensureReturnType(returnType, result, callLine);
        return result;
      },
    );
  }

  private createArrowFunction(ctx: ArrowFunctionExprContext): RuntimeCallable {
    const params = ctx.IDENTIFIER()
      ? [
          {
            name: ctx.IDENTIFIER()!.text,
            declaredType: ctx.typeName() ? ctx.typeName()!.text : null,
          },
        ]
      : paramsFromList(ctx.parameterList());
    const returnType = ctx.typeName() ? ctx.typeName()!.text : null;
    const body = ctx.arrowFunctionBody();
    const closure = this.scope;

    return makeCallable(
      params,
      returnType,
      (args: unknown[], callLine: number) => {
        const fnScope = closure.derive();
        this.bindParams(fnScope, params, args, callLine);
        let result: unknown = null;
        if (body.expression()) {
          result = this.evaluateExpressionInScope(
            body.expression()!,
            fnScope,
            callLine,
          );
        } else {
          result = this.runFunctionBodyStatements(
            body.functionBodyStatement(),
            fnScope,
            callLine,
          );
        }
        this.ensureReturnType(returnType, result, callLine);
        return result;
      },
    );
  }

  private createArrowDeclarationCallable(
    ctx: ArrowFunctionDeclarationContext,
  ): RuntimeCallable {
    const params = paramsFromList(ctx.parameterList());
    const returnType = ctx.typeName() ? ctx.typeName()!.text : null;
    const body = ctx.arrowFunctionBody();
    const closure = this.scope;

    return makeCallable(
      params,
      returnType,
      (args: unknown[], callLine: number) => {
        const fnScope = closure.derive();
        this.bindParams(fnScope, params, args, callLine);
        let result: unknown = null;
        if (body.expression()) {
          result = this.evaluateExpressionInScope(
            body.expression()!,
            fnScope,
            callLine,
          );
        } else {
          result = this.runFunctionBodyStatements(
            body.functionBodyStatement(),
            fnScope,
            callLine,
          );
        }
        this.ensureReturnType(returnType, result, callLine);
        return result;
      },
      ctx.IDENTIFIER().text,
    );
  }

  private createFunctionDeclarationCallable(
    ctx: FunctionDeclarationContext,
  ): RuntimeCallable {
    const params = paramsFromList(ctx.parameterList());
    const returnType = ctx.typeName() ? ctx.typeName()!.text : null;
    const bodyStatements = ctx.functionBodyStatement();
    const closure = this.scope;

    return makeCallable(
      params,
      returnType,
      (args: unknown[], callLine: number) => {
        const fnScope = closure.derive();
        this.bindParams(fnScope, params, args, callLine);
        const result = this.runFunctionBodyStatements(
          bodyStatements,
          fnScope,
          callLine,
        );
        this.ensureReturnType(returnType, result, callLine);
        return result;
      },
      ctx.IDENTIFIER().text,
    );
  }

  private bindParams(
    scope: Scope,
    params: RuntimeParameter[],
    args: unknown[],
    line: number,
  ): void {
    for (let i = 0; i < params.length; i += 1) {
      const param = params[i];
      const arg = i < args.length ? args[i] : null;
      scope.declare(param.name, arg, param.declaredType, line);
    }
  }

  private runFunctionBodyStatements(
    statements: FunctionBodyStatementContext[],
    fnScope: Scope,
    callLine: number,
  ): unknown {
    try {
      for (const statement of statements) {
        this.executeFunctionBodyStatement(statement, fnScope, callLine);
      }
      return null;
    } catch (error) {
      if (error instanceof ReturnSignal) return error.value;
      throw error;
    }
  }

  private executeFunctionBodyStatement(
    statement: FunctionBodyStatementContext,
    fnScope: Scope,
    line: number,
    inLoop = false,
  ): void {
    if (statement.constStatement())
      return this.executeConstStatement(
        statement.constStatement()!,
        fnScope,
        line,
      );
    if (statement.letStatement())
      return this.executeLetStatement(statement.letStatement()!, fnScope, line);
    if (statement.arrowFunctionDeclaration()) {
      const decl = statement.arrowFunctionDeclaration()!;
      const callable = this.createArrowDeclarationCallable(decl);
      fnScope.declare(decl.IDENTIFIER().text, callable, null, decl.start.line);
      return;
    }
    if (statement.ifStatement())
      return this.executeIfStatement(
        statement.ifStatement()!,
        fnScope,
        line,
        inLoop,
      );
    if (statement.forStatement())
      return this.executeForStatement(statement.forStatement()!, fnScope, line);
    if (statement.whileStatement())
      return this.executeWhileStatement(
        statement.whileStatement()!,
        fnScope,
        line,
      );
    if (statement.breakStatement()) {
      if (!inLoop)
        throw new MoonChunkError(
          "break can only be used inside a loop.",
          statement.start.line,
          1,
        );
      throw new BreakSignal();
    }
    if (statement.continueStatement()) {
      if (!inLoop)
        throw new MoonChunkError(
          "continue can only be used inside a loop.",
          statement.start.line,
          1,
        );
      throw new ContinueSignal();
    }
    if (statement.returnStatement()) {
      const ret = statement.returnStatement()!;
      throw new ReturnSignal(
        this.evaluateExpressionInScope(
          ret.expression(),
          fnScope,
          ret.start.line,
        ),
      );
    }
    if (statement.expressionStatement()) {
      this.evaluateExpressionInScope(
        statement.expressionStatement()!.expression(),
        fnScope,
        statement.start.line,
      );
      return;
    }
  }

  private executeRuntimeChunkStatement(
    stmt: RuntimeChunkStatementContext,
    fnScope: Scope,
    line: number,
    inLoop = false,
  ): void {
    if (stmt.constStatement())
      return this.executeConstStatement(stmt.constStatement()!, fnScope, line);
    if (stmt.letStatement())
      return this.executeLetStatement(stmt.letStatement()!, fnScope, line);
    if (stmt.functionDeclaration()) {
      const decl = stmt.functionDeclaration()!;
      const callable = this.createFunctionDeclarationCallable(decl);
      fnScope.declare(decl.IDENTIFIER().text, callable, null, decl.start.line);
      return;
    }
    if (stmt.arrowFunctionDeclaration()) {
      const decl = stmt.arrowFunctionDeclaration()!;
      const callable = this.createArrowDeclarationCallable(decl);
      fnScope.declare(decl.IDENTIFIER().text, callable, null, decl.start.line);
      return;
    }
    if (stmt.ifStatement())
      return this.executeIfStatement(
        stmt.ifStatement()!,
        fnScope,
        line,
        inLoop,
      );
    if (stmt.forStatement())
      return this.executeForStatement(stmt.forStatement()!, fnScope, line);
    if (stmt.whileStatement())
      return this.executeWhileStatement(stmt.whileStatement()!, fnScope, line);
    if (stmt.breakStatement()) {
      if (!inLoop)
        throw new MoonChunkError(
          "break can only be used inside a loop.",
          stmt.start.line,
          1,
        );
      throw new BreakSignal();
    }
    if (stmt.continueStatement()) {
      if (!inLoop)
        throw new MoonChunkError(
          "continue can only be used inside a loop.",
          stmt.start.line,
          1,
        );
      throw new ContinueSignal();
    }
    if (stmt.expressionStatement()) {
      this.evaluateExpressionInScope(
        stmt.expressionStatement()!.expression(),
        fnScope,
        stmt.start.line,
      );
      return;
    }
    if (stmt.pageStatement()) {
      throw new MoonChunkError(
        "Page statements are not allowed in expression function runtime.",
        stmt.start.line,
        1,
      );
    }
  }

  private executeIfStatement(
    stmt: IfStatementContext,
    fnScope: Scope,
    line: number,
    inLoop = false,
  ): void {
    const cond = this.evaluateExpressionInScope(
      stmt.expression(),
      fnScope,
      line,
    );
    if (!Boolean(cond)) return;
    const blockScope = fnScope.derive();
    for (const nested of stmt.runtimeChunkStatement()) {
      this.executeRuntimeChunkStatement(nested, blockScope, line, inLoop);
    }
  }

  private executeForStatement(
    stmt: ForStatementContext,
    fnScope: Scope,
    line: number,
  ): void {
    const loopScope = fnScope.derive();
    const init = stmt.forInit();
    const initName = init.IDENTIFIER().text;

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

    const initValue = this.evaluateExpressionInScope(
      init.expression(),
      loopScope,
      init.start.line,
    );
    loopScope.declare(initName, initValue, initDeclaredType, init.start.line);

    while (
      Boolean(
        this.evaluateExpressionInScope(stmt.expression(), loopScope, line),
      )
    ) {
      const iterScope = loopScope.derive();
      for (const nested of stmt.runtimeChunkStatement()) {
        try {
          this.executeRuntimeChunkStatement(nested, iterScope, line, true);
        } catch (error) {
          if (error instanceof ContinueSignal) break;
          if (error instanceof BreakSignal) return;
          throw error;
        }
      }

      const updateName = stmt.forUpdate().IDENTIFIER().text;
      const current = coerceToNumeric(
        loopScope.get(updateName),
        stmt.start.line,
      );
      loopScope.assign(
        updateName,
        makeNumeric(current.value + 1, current.numType),
        stmt.start.line,
      );
    }
  }

  private executeWhileStatement(
    stmt: WhileStatementContext,
    fnScope: Scope,
    line: number,
  ): void {
    const loopScope = fnScope.derive();
    while (
      Boolean(this.evaluateExpressionInScope(stmt.expression(), fnScope, line))
    ) {
      const iterScope = loopScope.derive();
      for (const nested of stmt.runtimeChunkStatement()) {
        try {
          this.executeRuntimeChunkStatement(nested, iterScope, line, true);
        } catch (error) {
          if (error instanceof ContinueSignal) break;
          if (error instanceof BreakSignal) return;
          throw error;
        }
      }
    }
  }

  private executeConstStatement(
    stmt: ConstStatementContext,
    fnScope: Scope,
    line: number,
  ): void {
    const value = this.evaluateExpressionInScope(
      stmt.expression(),
      fnScope,
      line,
    );
    fnScope.declare(
      stmt.IDENTIFIER().text,
      value,
      stmt.typeName() ? stmt.typeName()!.text : null,
      stmt.start.line,
      false,
    );
  }

  private executeLetStatement(
    stmt: LetStatementContext,
    fnScope: Scope,
    line: number,
  ): void {
    const value = this.evaluateExpressionInScope(
      stmt.expression(),
      fnScope,
      line,
    );
    fnScope.declare(
      stmt.IDENTIFIER().text,
      value,
      stmt.typeName() ? stmt.typeName()!.text : null,
      stmt.start.line,
    );
  }

  private evaluateExpressionInScope(
    expression: ExpressionContext,
    scope: Scope,
    line: number,
  ): unknown {
    const nested = new ExprEvaluator(scope, this.cwd, line, this.helpers);
    return nested.evaluateExpression(expression);
  }

  private ensureReturnType(
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

  private applyCall(target: unknown, args: unknown[]): unknown {
    if (isCallable(target)) {
      return target.invoke(args, this.line);
    }
    throw new MoonChunkError(
      `Value is not callable: ${inferType(target)}.`,
      this.line,
      1,
    );
  }

  private resolveIdentifierPath(ctx: IdentifierPathContext): unknown {
    const segments = getTerminalNodes(ctx.IDENTIFIER()).map(
      (node) => node.text,
    );
    const rootName = segments[0];
    let root: unknown = this.scope.get(rootName);
    if (root === undefined) root = this.helpers.getGlobal(rootName, this.line);
    if (root === undefined) root = this.getBuiltin(rootName);
    if (root === undefined) {
      throw new MoonChunkError(`Unknown variable: ${rootName}`, this.line, 1);
    }

    if (segments.length === 1) return root;
    return resolvePathValue(root, segments.slice(1));
  }

  private assignIdentifierPath(
    ctx: IdentifierPathContext,
    value: unknown,
  ): void {
    const segments = getTerminalNodes(ctx.IDENTIFIER()).map(
      (node) => node.text,
    );
    if (segments.length === 0)
      throw new MoonChunkError("Invalid assignment path.", this.line, 1);

    if (segments.length === 1) {
      this.scope.assign(segments[0], value, this.line);
      return;
    }

    const rootName = segments[0];
    const root = this.scope.get(rootName);
    if (root === undefined) {
      throw new MoonChunkError(
        `Cannot assign path on unknown variable: ${rootName}`,
        this.line,
        1,
      );
    }

    let current: unknown = root;
    for (let i = 1; i < segments.length - 1; i += 1) {
      const seg = segments[i];
      if (
        current === null ||
        current === undefined ||
        typeof current !== "object"
      ) {
        throw new MoonChunkError(
          `Cannot assign path through non-object at segment ${seg}.`,
          this.line,
          1,
        );
      }
      current = (current as Record<string, unknown>)[seg];
    }

    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      throw new MoonChunkError(
        `Cannot assign to path ${segments.join(".")}.`,
        this.line,
        1,
      );
    }

    (current as Record<string, unknown>)[segments[segments.length - 1]] = value;
  }

  private getBuiltin(name: string): unknown {
    if (name !== "data") return undefined;
    return makeCallable(
      [{ name: "path", declaredType: "string" }],
      null,
      (args: unknown[], line: number) => {
        if (args.length !== 1) {
          throw new MoonChunkError(
            "data(...) expects exactly one argument.",
            line,
            1,
          );
        }
        if (typeof args[0] !== "string") {
          throw new MoonChunkError("data(...) expects a string path.", line, 1);
        }
        const abs = path.resolve(this.cwd, args[0]);
        if (!fs.existsSync(abs)) {
          throw new MoonChunkError(
            `Data file does not exist: ${args[0]}`,
            line,
            1,
          );
        }
        return normalizeJsonNumbers(JSON.parse(fs.readFileSync(abs, "utf8")));
      },
      "data",
    );
  }
}

export function evalExpr(
  rawExpr: string,
  scope: Scope,
  cwd: string,
  line = 1,
  helpers: RuntimeHelpers = NO_HELPERS,
): unknown {
  const expr = rawExpr.trim();
  if (!expr) return null;

  const input = CharStreams.fromString(expr);
  const lexer = new MoonChunkLexer(input);
  const tokens = new CommonTokenStream(lexer);
  const parser = new MoonChunkParser(tokens);

  const syntax = new SyntaxCollector();
  lexer.removeErrorListeners();
  parser.removeErrorListeners();
  lexer.addErrorListener(syntax);
  parser.addErrorListener(syntax);

  const tree = parser.expressionFragment();
  if (syntax.diagnostics.length > 0) {
    const first = syntax.diagnostics[0];
    throw new MoonChunkError(first.message, line, first.column);
  }

  const evaluator = new ExprEvaluator(scope, cwd, line, helpers);
  return evaluator.evaluateFragment(tree);
}

export type { RuntimeCallable, RuntimeParameter };
export { makeCallable, isCallable };
